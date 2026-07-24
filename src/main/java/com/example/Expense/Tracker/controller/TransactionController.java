package com.example.Expense.Tracker.controller;

import com.example.Expense.Tracker.model.Transaction;
import com.example.Expense.Tracker.service.TransactionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/transactions")
@CrossOrigin(origins = "http://localhost:5173")
public class TransactionController {
    @Autowired
    TransactionService service;

    @GetMapping()
    public List<Transaction> getAllTransactions(){
        return service.getAllTransactions();
    }
    @GetMapping("/{id}")
    public Transaction getTransactionById(@PathVariable Integer id){
        return service.getById(id);
    }
    @DeleteMapping("/delete/{id}")
    public void deleteTranction(@PathVariable Integer id){
        service.deleteTransaction(id);
    }
    @PostMapping("/add")
    public Transaction addTransaction(@RequestBody Transaction transaction){
        return service.addTransaction(transaction);
    }
    @PutMapping("/update/{id}")
    public void updateTransaction(@PathVariable Integer id,@RequestBody Transaction transaction){
        service.updateTransaction(id,transaction);
    }
}
