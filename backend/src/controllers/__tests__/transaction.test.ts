import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import transactionController from '../transaction';
import Transaction from '../../models/transaction';
import Account from '../../models/account';
import Category from '../../models/category';

describe('Transaction Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mongoServer: MongoMemoryServer;
  let account1: any;
  let account2: any;
  let category: any;

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
    await Transaction.deleteMany({});
    await Account.deleteMany({});
    await Category.deleteMany({});

    // Create test data
    account1 = await Account.create({ name: 'Account 1' });
    account2 = await Account.create({ name: 'Account 2' });
    category = await Category.create({ name: 'Food' });

    req = {
      lang: 'en',
      body: {},
      params: {},
      query: {},
      headers: {}    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('post', () => {
    it('should create a new transaction', async () => {
      req.body = {
        fromAccount: account1._id.toString(),
        toAccount: account2._id.toString(),
        category: category._id.toString(),
        amount: 100,
        transactionDate: new Date()
      };

      await transactionController.post(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.data.amount).toBe(100);
    });

    it('should handle errors when creating a transaction', async () => {
      req.body = {}; // Missing required fields

      await transactionController.post(req as Request, res as Response);

      // Should return an error status (400 or 500)
      expect(res.status).toHaveBeenCalled();
      const statusCall = (res.status as jest.Mock).mock.calls[0][0];
      expect([400, 500]).toContain(statusCall);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('all', () => {
    it('should return all transactions', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        category: category._id,
        amount: 150,
        transactionDate: new Date()
      });

      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 200,
        transactionDate: new Date()
      });

      await transactionController.all(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const transactions = (res.json as jest.Mock).mock.calls[0][0];
      expect(transactions.length).toBe(2);
    });

    it('should handle errors when fetching all transactions', async () => {
      await mongoose.disconnect();

      await transactionController.all(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);

      const uri = mongoServer.getUri();
      await mongoose.connect(uri);
    });

    it('should filter transactions by fromAccount ID', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 250,
        transactionDate: new Date()
      });

      await Transaction.create({
        fromAccount: account2._id,
        toAccount: account1._id,
        amount: 100,
        transactionDate: new Date()
      });

      req.query = { fromAccount: account1._id.toString() };

      await transactionController.all(req as Request, res as Response);

      const transactions = (res.json as jest.Mock).mock.calls[0][0];
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(250);
    });

    it('should filter transactions by category ID', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        category: category._id,
        amount: 175,
        transactionDate: new Date()
      });

      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 200,
        transactionDate: new Date()
      });

      req.query = { category: category._id.toString() };

      await transactionController.all(req as Request, res as Response);

      const transactions = (res.json as jest.Mock).mock.calls[0][0];
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(175);
    });

    it('should filter transactions by date range', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 300,
        transactionDate: new Date('2023-01-15')
      });

      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 400,
        transactionDate: new Date('2023-02-15')
      });

      req.query = {
        fromDate: '2023-01-01',
        toDate: '2023-01-31'
      };

      await transactionController.all(req as Request, res as Response);

      const transactions = (res.json as jest.Mock).mock.calls[0][0];
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(300);
    });
  });

  describe('get', () => {
    it('should return a transaction by ID', async () => {
      const transaction = await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 100,
        transactionDate: new Date()
      });

      req.params = { id: transaction._id.toString() };

      await transactionController.get(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const result = (res.json as jest.Mock).mock.calls[0][0];
      expect(result.amount).toBe(100);
    });

    it('should return 404 if transaction not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await transactionController.get(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('update', () => {
    it('should update a transaction', async () => {
      const transaction = await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 100,
        transactionDate: new Date()
      });

      req.params = { id: transaction._id.toString() };
      req.body = { amount: 150 };

      await transactionController.update(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const result = (res.json as jest.Mock).mock.calls[0][0];
      expect(result.data.amount).toBe(150);
    });

    it('should return 404 if transaction not found during update', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      req.body = { amount: 150 };

      await transactionController.update(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('delete', () => {
    it('should delete a transaction', async () => {
      const transaction = await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 100,
        transactionDate: new Date()
      });

      req.params = { id: transaction._id.toString() };

      await transactionController.delete(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();

      // It's a soft delete, so the transaction still exists but isDeleted=true
      const deleted = await Transaction.findById(transaction._id);
      expect(deleted?.isDeleted).toBe(true);
    });

    it('should return 404 if transaction not found during delete', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await transactionController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('sumByAccount', () => {
    it('should return transaction sums for an account', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 100,
        transactionDate: new Date()
      });

      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 200,
        transactionDate: new Date()
      });

      req.params = { accountId: account1._id.toString() };

      await transactionController.sumByAccount(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const result = (res.json as jest.Mock).mock.calls[0][0];
      expect(result.transactions.totalOutgoing).toBeGreaterThan(0);
    });

    it('should handle date filtering for transaction sums', async () => {
      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 100,
        transactionDate: new Date('2023-01-15')
      });

      await Transaction.create({
        fromAccount: account1._id,
        toAccount: account2._id,
        amount: 200,
        transactionDate: new Date('2023-02-15')
      });

      req.params = {
        accountId: account1._id.toString(),
        fromDate: '2023-01-01',
        toDate: '2023-01-31'
      };

      await transactionController.sumByAccount(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
    });

    it('should handle empty transaction results', async () => {
      req.params = { accountId: account1._id.toString() };

      await transactionController.sumByAccount(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const result = (res.json as jest.Mock).mock.calls[0][0];
      expect(result.transactions.totalOutgoing).toBe(0);
      expect(result.transactions.totalIncoming).toBe(0);
    });

    it('should handle errors', async () => {
      req.params = { accountId: 'invalid-id' };

      await transactionController.sumByAccount(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
