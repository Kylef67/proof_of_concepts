import mongoose, { Document, Schema } from 'mongoose';

// Import will be available after Transaction model is compiled
let Transaction: any;

interface ICategory extends Document {
    name: string;
    description: string;
    icon: string;
    color: string;
    type: 'Income' | 'Expense';
    parent: mongoose.Types.ObjectId | null;
    order: number;
    balance: number; // Total amount from transactions in this category
    directBalance: number; // Amount from direct transactions (excluding subcategories)
    transactionCount: number; // Number of transactions in this category
    directTransactionCount: number; // Number of direct transactions (excluding subcategories)
    updatedAt?: number;
    lastSyncTimestamp?: number;
    syncVersion?: number;
    lastModifiedBy?: string;
}

const categorySchema: Schema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: false },
    icon: { type: String, required: false },
    color: { type: String, required: false },
    type: { type: String, enum: ['Income', 'Expense'], required: false, default: 'Expense' },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    order: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // Total balance including subcategories
    directBalance: { type: Number, default: 0 }, // Direct transactions only
    transactionCount: { type: Number, default: 0 }, // Total transaction count including subcategories
    directTransactionCount: { type: Number, default: 0 }, // Direct transaction count only
    updatedAt: { type: Number, default: Date.now },
    lastSyncTimestamp: { type: Number, default: Date.now },
    syncVersion: { type: Number, default: 1 },
    lastModifiedBy: { type: String, default: 'system' }
}, { timestamps: true });

// Virtual for getting subcategories
categorySchema.virtual('subcategories', {
    ref: 'Category',
    localField: '_id',
    foreignField: 'parent'
});

// Method to get all subcategories (direct children)
categorySchema.methods.getSubcategories = async function() {
    return await mongoose.model('Category').find({ parent: this._id });
};

// Static method to get root categories (categories without parents)
categorySchema.statics.getRootCategories = async function() {
    return await this.find({ parent: null });
};

// Helper function to get all descendant category IDs (including self)
async function getAllDescendantIds(categoryId: string): Promise<string[]> {
    try {
        if (!Transaction) {
            Transaction = mongoose.model('Transaction');
        }
        
        const descendants = [categoryId];
        const queue = [categoryId];
        
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const children = await Category.find({ parent: currentId });
            
            for (const child of children) {
                const childId = (child as any)._id.toString();
                descendants.push(childId);
                queue.push(childId);
            }
        }
        
        return descendants;
    } catch (error) {
        console.error('Error getting descendant IDs:', error);
        return [categoryId];
    }
}

// Helper function to update category balance incrementally
async function updateCategoryBalanceIncremental(categoryId: string, amountDelta: number, countDelta: number, operation: 'add' | 'subtract') {
    if (!categoryId) return;
    
    try {
        const updateAmount = operation === 'add' ? amountDelta : -amountDelta;
        const updateCount = operation === 'add' ? countDelta : -countDelta;
        
        // Update direct balance and count for the category
        await Category.findByIdAndUpdate(
            categoryId,
            { 
                $inc: { 
                    directBalance: updateAmount,
                    directTransactionCount: updateCount,
                    balance: updateAmount, // Also update total balance
                    transactionCount: updateCount // Also update total count
                },
                updatedAt: Date.now()
            },
            { new: true }
        );
        
        // Update parent categories' total balance and count (but not direct)
        const category = await Category.findById(categoryId);
        if (category && category.parent) {
            await updateParentCategoryBalances(category.parent.toString(), updateAmount, updateCount);
        }
    } catch (error) {
        console.error('Error updating category balance incrementally:', error);
        // Fallback to full recalculation
        await updateCategoryBalanceFull(categoryId);
    }
}

// Helper function to update parent category balances recursively
async function updateParentCategoryBalances(parentId: string, amountDelta: number, countDelta: number) {
    try {
        await Category.findByIdAndUpdate(
            parentId,
            { 
                $inc: { 
                    balance: amountDelta, // Update total balance (includes subcategories)
                    transactionCount: countDelta // Update total count (includes subcategories)
                },
                updatedAt: Date.now()
            },
            { new: true }
        );
        
        // Continue up the hierarchy
        const parentCategory = await Category.findById(parentId);
        if (parentCategory && parentCategory.parent) {
            await updateParentCategoryBalances(parentCategory.parent.toString(), amountDelta, countDelta);
        }
    } catch (error) {
        console.error('Error updating parent category balances:', error);
    }
}

// Helper function to calculate category balance from scratch (fallback)
async function updateCategoryBalanceFull(categoryId: string) {
    if (!categoryId) return;
    
    try {
        if (!Transaction) {
            Transaction = mongoose.model('Transaction');
        }
        
        // Get all descendant category IDs
        const descendantIds = await getAllDescendantIds(categoryId);
        const descendantObjectIds = descendantIds.map(id => new mongoose.Types.ObjectId(id));
        
        // Calculate direct transactions for this category only
        const directResult = await Transaction.aggregate([
            {
                $match: {
                    category: new mongoose.Types.ObjectId(categoryId),
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalCount: { $sum: 1 }
                }
            }
        ]);
        
        // Calculate total transactions for this category and all subcategories
        const totalResult = await Transaction.aggregate([
            {
                $match: {
                    category: { $in: descendantObjectIds },
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalCount: { $sum: 1 }
                }
            }
        ]);
        
        const directBalance = directResult[0]?.totalAmount || 0;
        const directCount = directResult[0]?.totalCount || 0;
        const totalBalance = totalResult[0]?.totalAmount || 0;
        const totalCount = totalResult[0]?.totalCount || 0;
        
        await Category.findByIdAndUpdate(
            categoryId,
            { 
                directBalance: directBalance,
                directTransactionCount: directCount,
                balance: totalBalance,
                transactionCount: totalCount,
                updatedAt: Date.now()
            },
            { new: true }
        );
    } catch (error) {
        console.error('Error updating category balance:', error);
    }
}

const Category = mongoose.model<ICategory>('Category', categorySchema);

export default Category; 