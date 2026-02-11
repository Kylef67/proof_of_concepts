import { z } from 'zod';
import { accountSchema, transactionSchema, categorySchema } from '../schemas';

describe('Validation Schemas', () => {
  describe('Account Schema', () => {
    it('should validate a valid account create request', () => {
      const validData = {
        name: 'Test Account',
        description: 'Test Description'
      };
      
      const result = accountSchema.create.safeParse(validData);
      expect(result.success).toBe(true);
    });
    
    it('should reject an invalid account create request', () => {
      const invalidData = {
        name: '',
        description: 'Test Description'
      };
      
      const result = accountSchema.create.safeParse(invalidData);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe('Name is required');
      }
    });
    
    it('should validate a valid account update request', () => {
      const validData = {
        name: 'Updated Account'
      };
      
      const result = accountSchema.update.safeParse(validData);
      expect(result.success).toBe(true);
    });
    
    it('should reject an empty account update request', () => {
      const emptyData = {};
      
      const result = accountSchema.update.safeParse(emptyData);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe('At least one field must be provided');
      }
    });
  });
  
  describe('Transaction Schema', () => {
    it('should validate a valid transaction create request', () => {
      const validData = {
        transactionDate: '2023-05-15',
        fromAccount: '507f1f77bcf86cd799439011',
        toAccount: '507f1f77bcf86cd799439012',
        amount: 100.50
      };

      const result = transactionSchema.create.safeParse(validData);
      expect(result.success).toBe(true);
    });
    
    it('should reject a transaction with invalid date', () => {
      const invalidData = {
        transactionDate: 'invalid-date',
        fromAccount: '507f1f77bcf86cd799439011',
        toAccount: '507f1f77bcf86cd799439012'
      };
      
      const result = transactionSchema.create.safeParse(invalidData);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe('Invalid date format');
      }
    });
    
    it('should validate a valid transaction query', () => {
      const validQuery = {
        fromAccount: '507f1f77bcf86cd799439011',
        fromDate: '2023-01-01',
        toDate: '2023-01-31'
      };
      
      const result = transactionSchema.query.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });
  
  describe('Category Schema', () => {
    it('should validate a valid category create request', () => {
      const validData = {
        name: 'Electronics',
        description: 'Electronic devices',
        image: 'electronics.jpg'
      };
      
      const result = categorySchema.create.safeParse(validData);
      expect(result.success).toBe(true);
    });
    
    it('should validate a category with parent', () => {
      const validData = {
        name: 'Laptops',
        description: 'Laptop computers',
        image: 'laptops.jpg',
        parent: '507f1f77bcf86cd799439011'
      };
      
      const result = categorySchema.create.safeParse(validData);
      expect(result.success).toBe(true);
    });
    
    it('should reject a category with invalid parent ID', () => {
      const invalidData = {
        name: 'Laptops',
        description: 'Laptop computers',
        image: 'laptops.jpg',
        parent: 'invalid-id'
      };
      
      const result = categorySchema.create.safeParse(invalidData);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe('Invalid parent ID');
      }
    });
  });
}); 