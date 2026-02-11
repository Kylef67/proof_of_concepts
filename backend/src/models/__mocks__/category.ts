const mockCategoryInstance = {
  save: jest.fn(),
  toObject: jest.fn()
};

const MockCategory: any = jest.fn().mockImplementation(() => mockCategoryInstance);

MockCategory.find = jest.fn();
MockCategory.findById = jest.fn();
MockCategory.findByIdAndUpdate = jest.fn();
MockCategory.findByIdAndDelete = jest.fn();
MockCategory.deleteMany = jest.fn();

export default MockCategory;
