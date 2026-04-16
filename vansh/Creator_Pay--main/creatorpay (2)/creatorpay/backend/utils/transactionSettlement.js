const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const PaymentLink = require('../models/PaymentLink');
const logger = require('./logger');

/**
 * Atomically settle a transaction using MongoDB sessions
 * Prevents race conditions and double-charging
 * 
 * @param {String} transactionId - Transaction ID to settle
 * @param {Object} updateData - Additional data to update
 * @returns {Object} Settlement result
 */
const settleTransaction = async (transactionId, updateData = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Get current transaction state with lock
    const txn = await Transaction.findById(transactionId).session(session);
    
    if (!txn) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    // Prevent double-settlement (idempotency)
    if (txn.status === 'confirmed' || txn.status === 'settled') {
      logger.warn(`Transaction ${transactionId} already in status ${txn.status}, skipping settlement`);
      await session.abortTransaction();
      return { success: false, message: 'Already settled', transaction: txn };
    }
    
    // Verify net amount is positive
    if (!txn.netAmount || txn.netAmount <= 0) {
      throw new Error(`Invalid net amount ${txn.netAmount} for transaction ${transactionId}`);
    }
    
    // Atomically update transaction
    const updatedTxn = await Transaction.findByIdAndUpdate(
      transactionId,
      {
        $set: {
          status: 'confirmed',
          settledAt: new Date(),
          ...updateData
        }
      },
      { session, new: true }
    );
    
    if (!updatedTxn) {
      throw new Error('Failed to update transaction');
    }
    
    // Atomically credit creator balance
    const updatedUser = await User.findByIdAndUpdate(
      txn.creator,
      {
        $inc: {
          'balance.available': txn.netAmount,
          'balance.totalEarned': txn.netAmount,
          'stats.totalTransactions': 1
        }
      },
      { session, new: true }
    );
    
    if (!updatedUser) {
      throw new Error(`Creator ${txn.creator} not found`);
    }
    
    // Atomically update payment link stats
    if (txn.paymentLink) {
      await PaymentLink.findByIdAndUpdate(
        txn.paymentLink,
        {
          $inc: {
            'stats.payments': 1,
            'stats.totalRevenue': txn.amount.usdEquivalent
          }
        },
        { session }
      );
    }
    
    await session.commitTransaction();
    logger.info(`✓ Transaction settled: ${transactionId} | Amount: $${txn.netAmount / 100} | Creator: ${txn.creator}`);
    
    return { 
      success: true, 
      transaction: updatedTxn,
      user: updatedUser
    };
    
  } catch (error) {
    await session.abortTransaction();
    logger.error(`✗ Settlement failed for ${transactionId}: ${error.message}`);
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Create a refund for a transaction
 * Reverses creator balance and creates reverse transaction record
 */
const refundTransaction = async (transactionId, reason = 'Merchant refund') => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const txn = await Transaction.findById(transactionId).session(session);
    
    if (!txn) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    if (!['confirmed', 'settled'].includes(txn.status)) {
      throw new Error(`Cannot refund transaction with status ${txn.status}`);
    }
    
    // Check if already refunded
    const existingRefund = await Transaction.findOne({
      relatedTransaction: transactionId,
      status: { $in: ['confirmed', 'settled'] }
    }).session(session);
    
    if (existingRefund) {
      throw new Error('Transaction already refunded');
    }
    
    // Reverse creator balance
    await User.findByIdAndUpdate(
      txn.creator,
      {
        $inc: {
          'balance.available': -txn.netAmount,
          'balance.totalEarned': 0 // Don't reduce total earned, just available
        }
      },
      { session }
    );
    
    // Create reverse charge transaction
    const reverseChargeAmount = Math.abs(txn.netAmount) * -1;
    const refundTxn = new Transaction({
      creator: txn.creator,
      paymentLink: txn.paymentLink,
      payer: txn.payer,
      amount: {
        value: reverseChargeAmount,
        currency: txn.amount.currency,
        usdEquivalent: Math.abs(txn.amount.usdEquivalent) * -1,
        exchangeRate: txn.amount.exchangeRate
      },
      fees: {
        platform: 0,
        gateway: 0,
        total: 0
      },
      netAmount: reverseChargeAmount,
      method: txn.method,
      status: 'settled',
      refundReason: reason,
      relatedTransaction: transactionId,
      settledAt: new Date()
    });
    
    await refundTxn.save({ session });
    await session.commitTransaction();
    
    logger.info(`✓ Refund processed: ${transactionId} | Amount: $${Math.abs(txn.netAmount / 100)} | Reason: ${reason}`);
    
    return {
      success: true,
      originalTransaction: txn,
      refundTransaction: refundTxn
    };
    
  } catch (error) {
    await session.abortTransaction();
    logger.error(`✗ Refund failed for ${transactionId}: ${error.message}`);
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = { settleTransaction, refundTransaction };
