package com.example.Expense.Tracker.dao;

import com.example.Expense.Tracker.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionRepository extends JpaRepository<Transaction,Integer> {
    Transaction findByTransactionCode(String transactionCode);
}
