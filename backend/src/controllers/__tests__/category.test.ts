import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import categoryController from '../category';
import Category from '../../models/category';
import Transaction from '../../models/transaction';

describe('Category Controller', () => {
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
    await Category.deleteMany({});
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
    it('should create a new category and return 201 status', async () => {
      req.body = {
        name: 'Electronics',
        description: 'Electronic devices'
      };

      await categoryController.post(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.data.name).toBe('Electronics');
      expect(jsonCall.message).toBeDefined();
    });

    it('should return 400 status when there is an error', async () => {
      req.body = {};

      await categoryController.post(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return a category when found', async () => {
      const category = await Category.create({ name: 'Electronics' });

      req.params = { id: category._id.toString() };

      await categoryController.get(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.name).toBe('Electronics');
    });

    it('should return 404 when category is not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await categoryController.get(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 when there is a server error', async () => {
      req.params = { id: 'invalid-id' };

      await categoryController.get(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('delete', () => {
    it('should delete a category and return success message', async () => {
      const category = await Category.create({ name: 'Electronics' });

      req.params = { id: category._id.toString() };

      await categoryController.delete(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({ message: 'Category deleted successfully' });
    });

    it('should return 404 when category is not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };

      await categoryController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 when trying to delete a category with subcategories', async () => {
      const parent = await Category.create({ name: 'Electronics' });
      await Category.create({ name: 'Smartphones', parent: parent._id });

      req.params = { id: parent._id.toString() };

      await categoryController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 when there is a server error', async () => {
      req.params = { id: 'invalid-id' };

      await categoryController.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
