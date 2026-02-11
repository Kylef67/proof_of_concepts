import { Request, Response } from "express";
import Category from "../models/category";
import Transaction from "../models/transaction";
import mongoose from "mongoose";
import { translate } from "../localization";

// Define interfaces for proper typing
interface ICategory {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  parent?: mongoose.Types.ObjectId | null;
}

// Helper function to transform category object for frontend
function transformCategoryForFrontend(category: any): any {
  const transformed = {
    ...category.toObject(),
    id: category._id.toString(),
  };
  delete transformed._id;
  delete transformed.__v;
  return transformed;
}
// Helper to generate a simple hash for category content comparison
function generateCategoryHash(category: any): string {
  const data = {
    name: category.name,
    description: category.description,
    icon: category.icon,
    color: (category as any).color,
    type: category.type,
    parent: category.parent || null,
    isDeleted: (category as any).isDeleted || false
  };
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export default {
  post: async (req: Request, res: Response): Promise<void> => {
    try {
      const categoryData = {
        ...req.body,
        updatedAt: Date.now(),
        syncVersion: 1,
        lastModifiedBy: req.body.deviceId || req.headers['x-device-id'] || 'system'
      };
      const category = new Category(categoryData);
      await category.save();
      res.status(201).json({
        data: transformCategoryForFrontend(category),
        message: translate('categories.created_success', req.lang)
      })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
  get: async (req: Request, res: Response): Promise<void> => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: translate('categories.not_found', req.lang) });
        return;
      }
      res.json(transformCategoryForFrontend(category));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  all: async (req: Request, res: Response): Promise<void> => {
    try {
      const { fromDate, toDate } = req.query;
      const categories = await Category.find();
      
      // Create date filter for transactions
      const dateFilter: any = {};
      
      if (fromDate) {
        dateFilter.$gte = new Date(fromDate as string);
      }
      
      if (toDate) {
        const toDateObj = new Date(toDate as string);
        toDateObj.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDateObj;
      }
      
      // Get transaction data for all categories
      const categoriesWithTransactions = await Promise.all(
        categories.map(async (category) => {
          const categoryId = new mongoose.Types.ObjectId(category._id as unknown as string);
          
          // Get all transactions in this category
          const transactionSum = await Transaction.aggregate([
            { 
              $match: { 
                category: categoryId,
                ...(Object.keys(dateFilter).length > 0 ? { transactionDate: dateFilter } : {})
              } 
            },
            { $group: { 
                _id: null, 
                total: { $sum: "$amount" },
                count: { $sum: 1 }
              } 
            }
          ]);
          
          // Get all subcategories to include them in the totals
          const subcategories = await Category.find({ parent: category._id }) as ICategory[];
          
          // If there are subcategories, get their transactions too
          let subcategoryTotals = { total: 0, count: 0 };
          
          if (subcategories.length > 0) {
            const subcategoryIds = subcategories.map(subcat => 
              new mongoose.Types.ObjectId(subcat._id.toString())
            );
            
            const subcategorySum = await Transaction.aggregate([
              { 
                $match: { 
                  category: { $in: subcategoryIds },
                  ...(Object.keys(dateFilter).length > 0 ? { transactionDate: dateFilter } : {})
                } 
              },
              { $group: { 
                  _id: null, 
                  total: { $sum: "$amount" },
                  count: { $sum: 1 }
                } 
              }
            ]);
            
            if (subcategorySum.length > 0) {
              subcategoryTotals = {
                total: subcategorySum[0].total,
                count: subcategorySum[0].count
              };
            }
          }
          
          // Calculate the totals
          const directTotal = transactionSum.length > 0 ? transactionSum[0].total : 0;
          const directCount = transactionSum.length > 0 ? transactionSum[0].count : 0;
          
          return {
            ...transformCategoryForFrontend(category),
            subcategories: subcategories.map(sub => transformCategoryForFrontend(sub)),
            transactions: {
              direct: {
                total: directTotal,
                count: directCount
              },
              subcategories: {
                total: subcategoryTotals.total,
                count: subcategoryTotals.count
              },
              all: {
                total: directTotal + subcategoryTotals.total,
                count: directCount + subcategoryTotals.count
              }
            }
          };
        })
      );
      
      res.json(categoriesWithTransactions);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  update: async (req: Request, res: Response): Promise<void> => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: translate('categories.not_found', req.lang) });
        return;
      }

      const updateData = {
        ...req.body,
        updatedAt: Date.now(),
        syncVersion: (category.syncVersion || 1) + 1,
        lastModifiedBy: req.body.deviceId || req.headers['x-device-id'] || 'system'
      };
      
      const updatedCategory = await Category.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
      });
      
      res.json(transformCategoryForFrontend(updatedCategory));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
  delete: async (req: Request, res: Response): Promise<void> => {
    try {
      const subcategories = await Category.find({ parent: req.params.id });
      if (subcategories.length > 0) {
        res.status(400).json({ 
          error: translate('categories.cannot_delete_with_subcategories', req.lang)
        });
        return;
      }

      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: translate('categories.not_found', req.lang) });
        return;
      }

      // Soft delete (mark as deleted but keep in database for sync purposes)
      category.updatedAt = Date.now();
      category.syncVersion = (category.syncVersion || 1) + 1;
      category.lastModifiedBy = req.body?.deviceId || req.headers['x-device-id'] as string || 'system';
      category.isDeleted = true;
      await category.save();

      res.json({ message: translate('categories.deleted_success', req.lang) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  getSubcategories: async (req: Request, res: Response): Promise<void> => {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) {
        res.status(404).json({ error: translate('categories.not_found', req.lang) });
        return;
      }
      
      const subcategories = await Category.find({ parent: category._id });
      res.json(subcategories.map(sub => transformCategoryForFrontend(sub)));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  getRootCategories: async (_req: Request, res: Response): Promise<void> => {
    try {
      const rootCategories = await Category.find({ parent: null });
      res.json(rootCategories.map(cat => transformCategoryForFrontend(cat)));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
  getCategoryTransactions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { fromDate, toDate } = req.query;
      const categoryId = req.params.id;
      
      // First verify the category exists
      const category = await Category.findById(categoryId);
      if (!category) {
        res.status(404).json({ error: translate('categories.not_found', req.lang) });
        return;
      }

      // Create date filter if needed
      const dateFilter: any = {};
      
      if (fromDate) {
        dateFilter.$gte = new Date(fromDate as string);
      }
      
      if (toDate) {
        const toDateObj = new Date(toDate as string);
        toDateObj.setHours(23, 59, 59, 999);
        dateFilter.$lte = toDateObj;
      }

      // Create match conditions for the aggregation
      const dateCondition = Object.keys(dateFilter).length > 0 
        ? { transactionDate: dateFilter } 
        : {};

      // Get all transactions in this category with optional date filtering
      const transactionSum = await Transaction.aggregate([
        { 
          $match: { 
            category: new mongoose.Types.ObjectId(categoryId),
            ...dateCondition
          } 
        },
        { $group: { 
            _id: null, 
            total: { $sum: "$amount" },
            count: { $sum: 1 }
          } 
        }
      ]);

      // Get all subcategories to include them in the totals
      const subcategories = await Category.find({ parent: categoryId }) as ICategory[];
      
      // If there are subcategories, get their transactions too
      let subcategoryTotals = { total: 0, count: 0 };
      
      if (subcategories.length > 0) {
        const subcategoryIds = subcategories.map(subcat => 
          new mongoose.Types.ObjectId(subcat._id.toString())
        );
        
        const subcategorySum = await Transaction.aggregate([
          { 
            $match: { 
              category: { $in: subcategoryIds },
              ...dateCondition
            } 
          },
          { $group: { 
              _id: null, 
              total: { $sum: "$amount" },
              count: { $sum: 1 }
            } 
          }
        ]);
        
        if (subcategorySum.length > 0) {
          subcategoryTotals = {
            total: subcategorySum[0].total,
            count: subcategorySum[0].count
          };
        }
      }

      // Calculate the totals
      const directTotal = transactionSum.length > 0 ? transactionSum[0].total : 0;
      const directCount = transactionSum.length > 0 ? transactionSum[0].count : 0;
      
      res.json({
        category: transformCategoryForFrontend(category),
        transactions: {
          direct: {
            total: directTotal,
            count: directCount
          },
          subcategories: {
            total: subcategoryTotals.total,
            count: subcategoryTotals.count
          },
          all: {
            total: directTotal + subcategoryTotals.total,
            count: directCount + subcategoryTotals.count
          }
        }
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
  ,
  // Update ordering of categories
  updateOrder: async (req: Request, res: Response): Promise<void> => {
    try {
      const { categories } = req.body;
      if (!Array.isArray(categories)) {
        res.status(400).json({ error: 'Categories must be an array' });
        return;
      }
      await Promise.all(categories.map(async (item: any) => {
        if (!item.id || typeof item.order !== 'number') throw new Error('Each category must have id and order');
        await Category.findByIdAndUpdate(item.id, { order: item.order, parent: item.parent || null, updatedAt: Date.now() });
      }));
      res.json({ success: true, message: translate('categories.order_updated', req.lang) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
  ,
  // Pull changed categories since last sync
  syncPull: async (req: Request, res: Response): Promise<void> => {
    try {
      const { lastSyncTimestamp = 0, categoryHashes } = req.body;
      const changed = await Category.find({ updatedAt: { $gt: lastSyncTimestamp } }).sort({ updatedAt: 1 });
      const filtered = Array.isArray(changed)
        ? changed.filter(cat => {
            const id = (cat as any)._id.toString();
            const serverHash = generateCategoryHash(cat);
            return !categoryHashes || (categoryHashes as any)[id] !== serverHash;
          })
        : [];
      res.json({
        categories: filtered.map(cat => {
          const base = transformCategoryForFrontend(cat);
          return {
            ...base,
            updatedAt: (cat as any).updatedAt,
            hash: generateCategoryHash(cat)
          };
        }),
        timestamp: Date.now()
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
  ,
  // Push local category changes to server
  syncPush: async (req: Request, res: Response): Promise<void> => {
    try {
      const { categories } = req.body;
      const timestamp = Date.now();
      const accepted: string[] = [];
      for (const data of categories) {
        const id = data.id;
        const existing = await Category.findById(id);
        if (!existing) {
          await new Category({ _id: id, ...data }).save();
          accepted.push(id);
        } else {
          const serverHash = generateCategoryHash(existing);
          if (data.updatedAt > (existing as any).updatedAt || data.hash !== serverHash) {
            Object.assign(existing, data);
            (existing as any).updatedAt = data.updatedAt;
            await existing.save();
            accepted.push(id);
          }
        }
      }
      res.json({ success: true, timestamp, accepted });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}; 