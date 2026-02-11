import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import accountController from '../account';
import Account from '../../models/account';
import Transaction from '../../models/transaction';

describe('Account Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all accounts and transactions before each test
    await Account.deleteMany({});
    await Transaction.deleteMany({});

    req = {
      lang: 'en',
      body: {},
      params: {},
      query: {},
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('post', () => {
    it('should create a new account and return 201 status', async () => {
      req.body = { name: 'Test Account', description: 'Test Description' };

      await accountController.post(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.data.name).toBe('Test Account');
      expect(jsonCall.data.description).toBe('Test Description');
      expect(jsonCall.message).toBeDefined();
    });

    it('should return 400 status when there is an error', async () => {
      req.body = {}; // Missing required name field

      await accountController.post(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return an account with transaction data when found', async () => {
      // Create a test account
      const account = await Account.create({
        name: 'Test Account',
        description: 'Test Description'
      });

      req.params = { id: account._id.toString() };

      await accountController.get(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      // Account data is flattened (spread operator)
      expect(jsonCall.name).toBe('Test Account');
      expect(jsonCall.transactions).toBeDefined();
    });

    it('should return 404 when account is not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await accountController.get(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account not found' });
    });

    it('should return 500 when there is a server error', async () => {
      req.params = { id: 'invalid-id' }; // Invalid ObjectId format

      await accountController.get(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('all', () => {
    it('should return all accounts including deleted', async () => {
      await Account.create({ name: 'Account 1', description: 'Desc 1' });
      await Account.create({ name: 'Account 2', description: 'Desc 2' });
      await Account.create({ name: 'Account 3', description: 'Desc 3', isDeleted: true });

      await accountController.all(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const accounts = (res.json as jest.Mock).mock.calls[0][0];
      // The controller returns ALL accounts (including deleted)
      expect(accounts.length).toBe(3);
    });

    it('should return 500 when there is a server error', async () => {
      // Force an error by disconnecting
      await mongoose.disconnect();

      await accountController.all(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();

      // Reconnect for other tests
      const uri = mongoServer.getUri();
      await mongoose.connect(uri);
    });
  });

  describe('update', () => {
    it('should update an account and return it', async () => {
      const account = await Account.create({
        name: 'Test Account',
        description: 'Test Description'
      });

      req.params = { id: account._id.toString() };
      req.body = { name: 'Updated Account' };

      await accountController.update(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      // Update returns transformed account directly (not wrapped)
      expect(jsonCall.name).toBe('Updated Account');
    });

    it('should return 404 when account is not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      req.body = { name: 'Updated Account' };

      await accountController.update(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account not found' });
    });

    it('should return 400 when there is an error', async () => {
      const account = await Account.create({
        name: 'Test Account',
        description: 'Test Description'
      });

      req.params = { id: account._id.toString() };
      req.body = { balance: 'invalid' }; // Invalid: string instead of number

      await accountController.update(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).toBeDefined();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft delete an account', async () => {
      const account = await Account.create({
        name: 'Test Account',
        description: 'Test Description'
      });

      req.params = { id: account._id.toString() };

      await accountController.delete(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({ message: 'Account deleted successfully' });

      // Verify it's soft deleted
      const deletedAccount = await Account.findById(account._id);
      expect(deletedAccount?.isDeleted).toBe(true);
    });

    it('should return 404 when account is not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await accountController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Account not found' });
    });

    it('should return 500 when there is a server error', async () => {
      req.params = { id: 'invalid-id' };

      await accountController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('updateOrder', () => {
    it('should reorder accounts successfully', async () => {
      const account1 = await Account.create({ name: 'Account 1', order: 0 });
      const account2 = await Account.create({ name: 'Account 2', order: 1 });

      req.body = {
        accounts: [
          { id: account2._id.toString(), order: 0 },
          { id: account1._id.toString(), order: 1 }
        ]
      };

      await accountController.updateOrder(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.success).toBe(true);
      expect(jsonCall.message).toBeDefined();

      const updatedAccount1 = await Account.findById(account1._id);
      const updatedAccount2 = await Account.findById(account2._id);
      expect(updatedAccount1?.order).toBe(1);
      expect(updatedAccount2?.order).toBe(0);
    });

    it('should return 400 when there is an error', async () => {
      req.body = {
        accounts: [
          { id: 'invalid', order: 0 } // Invalid ID format
        ]
      };

      await accountController.updateOrder(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });
  });
});
