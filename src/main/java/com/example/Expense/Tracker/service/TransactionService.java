package com.example.Expense.Tracker.service;

import com.example.Expense.Tracker.dao.TransactionRepository;
import com.example.Expense.Tracker.model.Transaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TransactionService {
    @Autowired
    private TransactionRepository repo;

    public void deleteTransaction(Integer id){
      repo.deleteById(id);
    }

    public List<Transaction> getAllTransactions(){
       return repo.findAll();
    }
    public Transaction getById(Integer id){
        return repo.findById(id).orElse(null);
    }
    public void updateTransaction(Integer id,Transaction transaction){
        Transaction t =repo.findById(id).orElseThrow(() -> new RuntimeException("Transaction not found with ID "+ id));
        t.setAmount(transaction.getAmount());
        t.setCategory(transaction.getCategory());
        t.setTransactionDate(transaction.getTransactionDate());
        t.setType(transaction.getType());

        repo.save(t);
    }
    public Transaction addTransaction(Transaction transaction){
        return repo.save(transaction);
    }
}
