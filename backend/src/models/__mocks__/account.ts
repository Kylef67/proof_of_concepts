const mockAccountInstance = {
  save: jest.fn(),
  toObject: jest.fn()
};

const MockAccount: any = jest.fn().mockImplementation(() => mockAccountInstance);

MockAccount.find = jest.fn();
MockAccount.findById = jest.fn();
MockAccount.findByIdAndUpdate = jest.fn();
MockAccount.findByIdAndDelete = jest.fn();
MockAccount.deleteMany = jest.fn();

export default MockAccount;
