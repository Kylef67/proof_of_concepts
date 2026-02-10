import mongoose, { Document, Schema, Query, Model } from "mongoose";
import Account from "./account";
import Category from "./category";

interface ITransaction extends Document {
    transactionDate: Date;
    fromAccount: string;
    toAccount?: string;
    category?: string;
    amount: number;
    description?: string;
    notes?: string;
    type?: 'income' | 'expense' | 'transfer',
    isDeleted?: boolean;
    deletedAt?: Date;
    updatedAt?: number;
    lastSyncTimestamp?: number;
    syncVersion?: number;
    lastModifiedBy?: string;
    softDelete(): Promise<ITransaction>;
}

interface ITransactionQuery extends Query<any, ITransaction> {
    notDeleted(): ITransactionQuery;
}

interface ITransactionModel extends Model<ITransaction> {
    findNotDeleted(filter?: any): ITransactionQuery;
}

const transactionSchema: Schema = new mongoose.Schema({
    transactionDate: {
        type: Date,
        required: true
    },
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: false
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: false
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    notes: {
        type: String,
        required: false
    },
    type: {
        type: String,
        enum: ['income', 'expense', 'transfer'],
        required: false
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true // Add index for efficient querying
    },
    deletedAt: {
        type: Date,
        required: false
    },
    updatedAt: {
        type: Number,
        default: Date.now
    },
    lastSyncTimestamp: {
        type: Number,
        default: Date.now
    },
    syncVersion: {
        type: Number,
        default: 1
    },
    lastModifiedBy: {
        type: String,
        default: 'system'
    }
}, { timestamps: true }) // Add automatic createdAt/updatedAt

// Create indexes for frequently queried fields
transactionSchema.index({ fromAccount: 1 });
transactionSchema.index({ toAccount: 1 });
transactionSchema.index({ transactionDate: 1 });
transactionSchema.index({ category: 1 });
// Compound indexes for common query patterns with soft delete filter
transactionSchema.index({ fromAccount: 1, isDeleted: 1, transactionDate: 1 });
transactionSchema.index({ toAccount: 1, isDeleted: 1, transactionDate: 1 });
transactionSchema.index({ category: 1, isDeleted: 1, transactionDate: 1 });
transactionSchema.index({ isDeleted: 1, transactionDate: 1 });

// Add instance method for soft delete
transactionSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.updatedAt = Date.now();
    return this.save(); // This will trigger the post-save hook to update balances
};

// Add static method to find non-deleted documents
transactionSchema.statics.findNotDeleted = function(filter = {}) {
    return this.find({ ...filter, isDeleted: { $ne: true } });
};

// Helper function to calculate account balance incrementally
async function updateAccountBalanceIncremental(accountId: string, amountDelta: number, operation: 'add' | 'subtract') {
    if (!accountId || amountDelta === 0) return;
    
    try {
        const updateAmount = operation === 'add' ? amountDelta : -amountDelta;
        
        await Account.findByIdAndUpdate(
            accountId,
            { 
                $inc: { balance: updateAmount },
                updatedAt: Date.now()
            },
            { new: true }
        );
    } catch (error) {
        console.error('Error updating account balance incrementally:', error);
        // Fallback to full recalculation if incremental update fails
        await updateAccountBalanceFull(accountId);
    }
}

// Helper function to update category balance incrementally
async function updateCategoryBalanceIncremental(categoryId: string, amountDelta: number, operation: 'add' | 'subtract') {
    if (!categoryId) return;
    
    try {
        const updateAmount = operation === 'add' ? amountDelta : -amountDelta;
        const updateCount = operation === 'add' ? 1 : -1;
        
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
        // Note: We could add fallback to full recalculation here if needed
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
async function updateAccountBalanceFull(accountId: string) {
    if (!accountId) return;
    
    try {
        // Single aggregation query that calculates the balance in one go
        const balanceResult = await Transaction.aggregate([
            {
                $match: {
                    $or: [
                        { fromAccount: new mongoose.Types.ObjectId(accountId) },
                        { toAccount: new mongoose.Types.ObjectId(accountId) }
                    ],
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$fromAccount', new mongoose.Types.ObjectId(accountId)] },
                                        { $eq: ['$type', 'income'] }
                                    ]
                                },
                                '$amount', // Add income from this account
                                {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ['$fromAccount', new mongoose.Types.ObjectId(accountId)] },
                                                { $in: ['$type', ['expense', 'transfer']] }
                                            ]
                                        },
                                        { $multiply: ['$amount', -1] }, // Subtract expenses and transfers out
                                        {
                                            $cond: [
                                                {
                                                    $and: [
                                                        { $eq: ['$toAccount', new mongoose.Types.ObjectId(accountId)] },
                                                        { $eq: ['$type', 'transfer'] }
                                                    ]
                                                },
                                                '$amount', // Add transfers in
                                                0
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        ]);

        const balance = balanceResult[0]?.total || 0;

        await Account.findByIdAndUpdate(
            accountId,
            { 
                balance: balance,
                updatedAt: Date.now()
            },
            { new: true }
        );
    } catch (error) {
        console.error('Error updating account balance:', error);
    }
}

// Helper function to apply transaction effects to account balances
async function applyTransactionToBalance(transaction: ITransaction, operation: 'add' | 'remove') {
    const { fromAccount, toAccount, category, amount, type } = transaction;
    
    // Update account balances
    if (type === 'income') {
        // Income adds to fromAccount
        await updateAccountBalanceIncremental(fromAccount.toString(), amount, operation === 'add' ? 'add' : 'subtract');
    } else if (type === 'expense') {
        // Expense subtracts from fromAccount
        await updateAccountBalanceIncremental(fromAccount.toString(), amount, operation === 'add' ? 'subtract' : 'add');
    } else if (type === 'transfer' && toAccount) {
        // Transfer: subtract from fromAccount, add to toAccount
        await Promise.all([
            updateAccountBalanceIncremental(fromAccount.toString(), amount, operation === 'add' ? 'subtract' : 'add'),
            updateAccountBalanceIncremental(toAccount.toString(), amount, operation === 'add' ? 'add' : 'subtract')
        ]);
    }
    
    // Update category balance if transaction has a category
    if (category) {
        await updateCategoryBalanceIncremental(category.toString(), amount, operation === 'add' ? 'add' : 'subtract');
    }
}

// Post hook for save (create and update)
transactionSchema.post('save', async function(doc) {
    try {
        // Check if this is a new document or if relevant fields changed
        const isNew = doc.isNew;
        const wasDeleted = (doc as any)._accountsToUpdate; // From pre-save hook
        
        if (isNew && !doc.isDeleted) {
            // New transaction - add its effects
            await applyTransactionToBalance(doc as unknown as ITransaction, 'add');
        } else if (wasDeleted && doc.isDeleted) {
            // Soft delete - remove its effects
            const accountsToUpdate = (doc as any)._accountsToUpdate;
            const transactionForBalance = {
                fromAccount: accountsToUpdate.fromAccount,
                toAccount: accountsToUpdate.toAccount,
                amount: doc.amount,
                type: doc.type
            } as ITransaction;
            await applyTransactionToBalance(transactionForBalance, 'remove');
        }
    } catch (error) {
        console.error('Error in transaction post-save hook:', error);
        // Fallback to full recalculation for affected accounts and categories
        if (doc.fromAccount) await updateAccountBalanceFull(doc.fromAccount.toString());
        if (doc.toAccount) await updateAccountBalanceFull(doc.toAccount.toString());
        if (doc.category) {
            // Note: We would need to implement updateCategoryBalanceFull in category model
            console.log('Category balance recalculation needed for:', doc.category.toString());
        }
    }
});

// For updates, we need to handle them differently since we need the old values
transactionSchema.pre('findOneAndUpdate', async function(next) {
    try {
        // Store the original transaction for comparison
        const docToUpdate = await this.model.findOne(this.getQuery());
        if (docToUpdate) {
            (this as any)._originalTransaction = docToUpdate.toObject();
        }
    } catch (error) {
        console.error('Error in pre-update hook:', error);
    }
    next();
});

// Post hook for findOneAndUpdate
transactionSchema.post('findOneAndUpdate', async function(doc) {
    if (!doc) return;
    
    try {
        const originalTransaction = (this as any)._originalTransaction;
        
        if (originalTransaction && !originalTransaction.isDeleted && !doc.isDeleted) {
            // Transaction was updated (not deleted) - remove old effects and add new ones
            await Promise.all([
                applyTransactionToBalance(originalTransaction, 'remove'),
                applyTransactionToBalance(doc as unknown as ITransaction, 'add')
            ]);
        } else if (originalTransaction && !originalTransaction.isDeleted && doc.isDeleted) {
            // Transaction was soft deleted - remove its effects
            await applyTransactionToBalance(originalTransaction, 'remove');
        } else if (originalTransaction && originalTransaction.isDeleted && !doc.isDeleted) {
            // Transaction was undeleted - add its effects back
            await applyTransactionToBalance(doc as unknown as ITransaction, 'add');
        }
    } catch (error) {
        console.error('Error in transaction post-update hook:', error);
        // Fallback to full recalculation for all potentially affected accounts
        const accountsToRecalculate = new Set();
        const categoriesToRecalculate = new Set();
        
        if (doc.fromAccount) accountsToRecalculate.add(doc.fromAccount.toString());
        if (doc.toAccount) accountsToRecalculate.add(doc.toAccount.toString());
        if (doc.category) categoriesToRecalculate.add(doc.category.toString());
        
        const originalTransaction = (this as any)._originalTransaction;
        if (originalTransaction) {
            if (originalTransaction.fromAccount) accountsToRecalculate.add(originalTransaction.fromAccount.toString());
            if (originalTransaction.toAccount) accountsToRecalculate.add(originalTransaction.toAccount.toString());
            if (originalTransaction.category) categoriesToRecalculate.add(originalTransaction.category.toString());
        }
        
        await Promise.all([
            ...Array.from(accountsToRecalculate).map(accountId => updateAccountBalanceFull(accountId as string)),
            // Note: Category full recalculation would be implemented here
            ...Array.from(categoriesToRecalculate).map(categoryId => 
                console.log('Category balance recalculation needed for:', categoryId)
            )
        ]);
    }
});

// Post hook for findOneAndDelete and deleteOne
transactionSchema.post(['findOneAndDelete', 'deleteOne'], async function(doc) {
    if (!doc || doc.isDeleted) return; // Don't process if already soft deleted
    
    try {
        // Hard delete - remove transaction effects
        await applyTransactionToBalance(doc as unknown as ITransaction, 'remove');
    } catch (error) {
        console.error('Error in transaction post-delete hook:', error);
        // Fallback to full recalculation
        if (doc.fromAccount) await updateAccountBalanceFull(doc.fromAccount.toString());
        if (doc.toAccount) await updateAccountBalanceFull(doc.toAccount.toString());
        if (doc.category) {
            console.log('Category balance recalculation needed for:', doc.category.toString());
        }
    }
});

// Pre hook for soft delete to capture the document before it's marked as deleted
transactionSchema.pre('save', async function(next) {
    // If this is a soft delete operation (isDeleted is being set to true)
    if (this.isModified('isDeleted') && this.isDeleted) {
        // Store the account IDs for the post hook
        (this as any)._accountsToUpdate = {
            fromAccount: this.fromAccount,
            toAccount: this.toAccount
        };
    }
    next();
});

const Transaction = mongoose.model<ITransaction, ITransactionModel>('Transaction', transactionSchema);

export default Transaction