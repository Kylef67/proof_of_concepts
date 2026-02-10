import { Request, Response } from "express";
import Account from "../models/account";
import Category from "../models/category";
import Transaction from "../models/transaction";
import { translate } from "../localization";

// Helper function to transform document for frontend
function transformForFrontend(doc: any): any {
  if (!doc) return null;
  const transformed = doc.toObject ? doc.toObject() : { ...doc };
  transformed.id = transformed._id.toString();
  delete transformed._id;
  delete transformed.__v;
  return transformed;
}

export default {
  // GET /api/sync/changes - Get all changes since last sync
  getChanges: async (req: Request, res: Response): Promise<void> => {
    try {
      const { lastSyncTimestamp, deviceId } = req.query;
      
      if (!lastSyncTimestamp) {
        res.status(400).json({ 
          error: translate('sync.missing_timestamp', req.lang) || 'lastSyncTimestamp is required' 
        });
        return;
      }

      const timestamp = parseInt(lastSyncTimestamp as string, 10);
      const currentTimestamp = Date.now();

      console.log(`🔄 Sync request from device ${deviceId} since ${new Date(timestamp).toISOString()}`);

      // Query for all records updated since last sync
      const [accounts, categories, transactions] = await Promise.all([
        Account.find({ 
          updatedAt: { $gt: timestamp } 
        }).lean(),
        Category.find({ 
          updatedAt: { $gt: timestamp } 
        }).lean(),
        Transaction.find({ 
          updatedAt: { $gt: timestamp } 
        }).lean()
      ]);

      // Transform all documents
      const responseData = {
        accounts: accounts.map(transformForFrontend),
        categories: categories.map(transformForFrontend),
        transactions: transactions.map(transformForFrontend),
        currentTimestamp,
        syncedAt: new Date().toISOString()
      };

      console.log(`✅ Sync response: ${accounts.length} accounts, ${categories.length} categories, ${transactions.length} transactions`);

      res.json(responseData);
    } catch (err) {
      console.error('❌ Sync error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },

  // POST /api/sync/push - Push offline changes to server
  pushChanges: async (req: Request, res: Response): Promise<void> => {
    try {
      const { operations, deviceId } = req.body;
      
      if (!operations || !Array.isArray(operations)) {
        res.status(400).json({ 
          error: translate('sync.invalid_operations', req.lang) || 'operations array is required' 
        });
        return;
      }

      console.log(`📤 Push ${operations.length} operations from device ${deviceId}`);

      const results = {
        accepted: [] as any[],
        rejected: [] as any[],
        conflicts: [] as any[],
        serverData: {
          accounts: [] as any[],
          categories: [] as any[],
          transactions: [] as any[]
        }
      };

      // Process each operation
      for (const operation of operations) {
        try {
          const { type, resource, data, localTimestamp, operationId, expectedSyncVersion } = operation;
          
          console.log(`  Processing ${type} ${resource}: ${data.id || data.name}`);

          let Model: any;
          let resourceType: 'accounts' | 'categories' | 'transactions';
          
          switch (resource) {
            case 'account':
              Model = Account;
              resourceType = 'accounts';
              break;
            case 'category':
              Model = Category;
              resourceType = 'categories';
              break;
            case 'transaction':
              Model = Transaction;
              resourceType = 'transactions';
              break;
            default:
              throw new Error(`Unknown resource type: ${resource}`);
          }

          // Handle different operation types
          if (type === 'CREATE') {
            // For create operations, check if record already exists (might have been synced)
            const existingId = data.id && data.id.length === 24 ? data.id : null;
            let existing = existingId ? await Model.findById(existingId) : null;

            if (existing) {
              // Record already exists, treat as conflict
              console.log(`  ⚠️  Conflict: ${resource} ${data.id} already exists`);
              results.conflicts.push({
                operationId,
                reason: 'Record already exists',
                serverRecord: transformForFrontend(existing)
              });
              results.serverData[resourceType].push(transformForFrontend(existing));
            } else {
              // Create new record
              const createData = { ...data };
              if (existingId) {
                createData._id = existingId;
              }
              delete createData.id;
              createData.updatedAt = Date.now();
              createData.lastSyncTimestamp = Date.now();
              createData.syncVersion = 1;
              createData.lastModifiedBy = deviceId || 'unknown';

              const newRecord = new Model(createData);
              await newRecord.save();
              
              console.log(`  ✅ Created ${resource}: ${newRecord._id}`);
              results.accepted.push({ operationId, id: newRecord._id.toString() });
              results.serverData[resourceType].push(transformForFrontend(newRecord));
            }
          } else if (type === 'UPDATE') {
            // For updates, check for conflicts
            const recordId = data.id;
            const existing = await Model.findById(recordId);

            if (!existing) {
              console.log(`  ⚠️  Conflict: ${resource} ${recordId} not found`);
              results.conflicts.push({
                operationId,
                reason: 'Record not found on server',
                serverRecord: null
              });
            } else {
              // First-to-sync-wins conflict detection
              const expectedVersion = expectedSyncVersion || data.syncVersion || existing.syncVersion;

              if (existing.syncVersion !== expectedVersion) {
                // Another device modified this record since client's last sync
                console.log(`  ⚠️  First-to-sync conflict: ${resource} ${recordId} - expected v${expectedVersion}, but server has v${existing.syncVersion} by ${existing.lastModifiedBy}`);

                results.conflicts.push({
                  operationId,
                  reason: `Another device (${existing.lastModifiedBy}) modified this record first`,
                  serverRecord: transformForFrontend(existing),
                  serverSyncVersion: existing.syncVersion,
                  expectedSyncVersion: expectedVersion,
                  conflictType: 'first-to-sync-wins',
                  lastModifiedBy: existing.lastModifiedBy
                });
                results.serverData[resourceType].push(transformForFrontend(existing));
              } else {
                // Apply update
                const updateData = { ...data };
                delete updateData.id;
                delete updateData._id;
                updateData.updatedAt = Date.now();
                updateData.lastSyncTimestamp = Date.now();
                updateData.syncVersion = (existing.syncVersion || 1) + 1;
                updateData.lastModifiedBy = deviceId || 'unknown';

                const updated = await Model.findByIdAndUpdate(
                  recordId,
                  updateData,
                  { new: true, runValidators: true }
                );

                console.log(`  ✅ Updated ${resource}: ${recordId}`);
                results.accepted.push({ operationId, id: recordId });
                results.serverData[resourceType].push(transformForFrontend(updated));
              }
            }
          } else if (type === 'DELETE') {
            // For deletes, check for conflicts
            const recordId = data.id;
            const existing = await Model.findById(recordId);

            if (!existing) {
              console.log(`  ℹ️  ${resource} ${recordId} already deleted or not found`);
              results.accepted.push({ operationId, id: recordId });
            } else {
              // First-to-sync-wins conflict detection
              const expectedVersion = expectedSyncVersion || data.syncVersion || existing.syncVersion;

              if (existing.syncVersion !== expectedVersion) {
                // Another device modified this record since client's last sync
                console.log(`  ⚠️  First-to-sync conflict: ${resource} ${recordId} - delete rejected, expected v${expectedVersion}, but server has v${existing.syncVersion} by ${existing.lastModifiedBy}`);

                results.conflicts.push({
                  operationId,
                  reason: `Another device (${existing.lastModifiedBy}) modified this record first, delete rejected`,
                  serverRecord: transformForFrontend(existing),
                  serverSyncVersion: existing.syncVersion,
                  expectedSyncVersion: expectedVersion,
                  conflictType: 'first-to-sync-wins',
                  lastModifiedBy: existing.lastModifiedBy
                });
                results.serverData[resourceType].push(transformForFrontend(existing));
              } else {
                // Perform soft delete
                const updated = await Model.findByIdAndUpdate(
                  recordId,
                  {
                    isDeleted: true,
                    deletedAt: new Date(),
                    updatedAt: Date.now(),
                    lastSyncTimestamp: Date.now(),
                    syncVersion: (existing.syncVersion || 1) + 1,
                    lastModifiedBy: deviceId || 'unknown'
                  },
                  { new: true }
                );

                console.log(`  ✅ Deleted ${resource}: ${recordId}`);
                results.accepted.push({ operationId, id: recordId });
                results.serverData[resourceType].push(transformForFrontend(updated));
              }
            }
          }
        } catch (operationError) {
          console.error(`  ❌ Error processing operation:`, operationError);
          results.rejected.push({
            operationId: operation.operationId,
            error: (operationError as Error).message
          });
        }
      }

      console.log(`✅ Push complete: ${results.accepted.length} accepted, ${results.conflicts.length} conflicts, ${results.rejected.length} rejected`);

      res.json({
        success: true,
        ...results,
        currentTimestamp: Date.now()
      });
    } catch (err) {
      console.error('❌ Push error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },

  // GET /api/sync/status - Get sync status and server info
  getStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const [accountCount, categoryCount, transactionCount] = await Promise.all([
        Account.countDocuments({ isDeleted: { $ne: true } }),
        Category.countDocuments(),
        Transaction.countDocuments({ isDeleted: { $ne: true } })
      ]);

      res.json({
        status: 'online',
        serverTime: Date.now(),
        counts: {
          accounts: accountCount,
          categories: categoryCount,
          transactions: transactionCount
        }
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
};
