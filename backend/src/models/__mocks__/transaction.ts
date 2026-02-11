const mockTransactionInstance = {
  save: jest.fn(),
  toObject: jest.fn()
};

const MockTransaction: any = jest.fn().mockImplementation(() => mockTransactionInstance);

MockTransaction.find = jest.fn();
MockTransaction.findById = jest.fn();
MockTransaction.findByIdAndUpdate = jest.fn();
MockTransaction.findByIdAndDelete = jest.fn();
MockTransaction.aggregate = jest.fn();
MockTransaction.deleteMany = jest.fn();

export default MockTransaction;
