
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Account from '../account';

interface IAccountDocument extends mongoose.Document {
  name: string;
  description: string;
  balance?: number;
  type?: string;
  icon?: string;
  color?: string;
  includeInTotal?: boolean;
  creditLimit?: number;
  updatedAt: number;
  isDeleted?: boolean;
  createdAt: Date;
}

describe('Account Model', () => {
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

  afterEach(async () => {
    await Account.deleteMany({});
  });

  it('should create and save an account successfully', async () => {
    const accountData = {
      name: 'Test Account',
      description: 'Test Description'
    };
    const account = new Account(accountData);

    const savedAccount = await account.save() as IAccountDocument;

    expect(savedAccount._id).toBeDefined();
    expect(savedAccount.name).toBe(accountData.name);
    expect(savedAccount.description).toBe(accountData.description);
    expect(savedAccount.balance).toBe(0);
    expect(savedAccount.type).toBe('debit');
    expect(savedAccount.icon).toBe('bank');
    expect(savedAccount.color).toBe('#007AFF');
    expect(savedAccount.includeInTotal).toBe(true);
    expect(savedAccount.isDeleted).toBe(false);
    expect(savedAccount.createdAt).toBeDefined();
    expect(savedAccount.updatedAt).toBeDefined();
  });

  it('should fail to save an account without required fields', async () => {
    const accountWithoutName = new Account({ description: 'Test Description' });

    await expect(accountWithoutName.save()).rejects.toThrow();
  });

  it('should find an account by id', async () => {
    const account = new Account({
      name: 'Test Account',
      description: 'Test Description'
    });
    const savedAccount = await account.save();

    const foundAccount = await Account.findById(savedAccount._id);

    expect(foundAccount).toBeDefined();
    expect(foundAccount?.name).toBe(savedAccount.name);
    expect(foundAccount?.description).toBe(savedAccount.description);
  });

  it('should update an account', async () => {
    const account = new Account({
      name: 'Test Account',
      description: 'Test Description'
    });
    const savedAccount = await account.save();
    
    const updatedAccount = await Account.findByIdAndUpdate(
      savedAccount._id,
      { name: 'Updated Account', description: 'Updated Description' },
      { new: true }
    );

    expect(updatedAccount).toBeDefined();
    expect(updatedAccount?.name).toBe('Updated Account');
    expect(updatedAccount?.description).toBe('Updated Description');
  });

  it('should delete an account', async () => {
    const account = new Account({
      name: 'Test Account',
      description: 'Test Description'
    });
    const savedAccount = await account.save();
    
    await Account.findByIdAndDelete(savedAccount._id);
    const deletedAccount = await Account.findById(savedAccount._id);

    expect(deletedAccount).toBeNull();
  });

  it('should create an account with sync fields', async () => {
    const accountData = {
      name: 'Sync Test Account',
      description: 'Test Description',
      balance: 1000,
      type: 'credit',
      icon: 'credit-card',
      color: '#FF0000',
      includeInTotal: false,
      creditLimit: 5000,
      updatedAt: Date.now(),
      isDeleted: false
    };
    const account = new Account(accountData);

    const savedAccount = await account.save() as IAccountDocument;

    expect(savedAccount._id).toBeDefined();
    expect(savedAccount.name).toBe(accountData.name);
    expect(savedAccount.description).toBe(accountData.description);
    expect(savedAccount.balance).toBe(accountData.balance);
    expect(savedAccount.type).toBe(accountData.type);
    expect(savedAccount.icon).toBe(accountData.icon);
    expect(savedAccount.color).toBe(accountData.color);
    expect(savedAccount.includeInTotal).toBe(accountData.includeInTotal);
    expect(savedAccount.creditLimit).toBe(accountData.creditLimit);
    // updatedAt might be slightly different due to mongoose timestamps, so check it's close
    expect(Math.abs(savedAccount.updatedAt - accountData.updatedAt)).toBeLessThan(10);
    expect(savedAccount.isDeleted).toBe(accountData.isDeleted);
  });

  it('should soft delete an account', async () => {
    const account = new Account({
      name: 'Test Account',
      description: 'Test Description'
    });
    const savedAccount = await account.save();
    
    const updatedAccount = await Account.findByIdAndUpdate(
      savedAccount._id,
      { isDeleted: true, updatedAt: Date.now() },
      { new: true }
    );

    expect(updatedAccount).toBeDefined();
    expect(updatedAccount?.isDeleted).toBe(true);
  });
}); 