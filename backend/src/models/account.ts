import mongoose, { Document, Schema } from 'mongoose';

interface IAccount extends Document {
    name: string;
    description?: string;
    balance?: number;
    type?: string;
    icon?: string;
    color?: string;
    includeInTotal?: boolean;
    creditLimit?: number;
    order?: number;
    updatedAt: number;
    isDeleted?: boolean;
    syncVersion?: number;
    lastModifiedBy?: string;
    createdAt: Date;
}

const accountSchema: Schema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    type: { type: String, enum: ['debit', 'credit', 'wallet'], default: 'debit' },
    icon: { type: String, default: 'bank' },
    color: { type: String, default: '#007AFF' },
    includeInTotal: { type: Boolean, default: true },
    creditLimit: { type: Number },
    order: { type: Number, default: 0 },
    updatedAt: { type: Number, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    syncVersion: { type: Number, default: 1 },
    lastModifiedBy: { type: String, default: 'system' }
}, { timestamps: true });

const Account = mongoose.model<IAccount>('Account', accountSchema);

export default Account;
