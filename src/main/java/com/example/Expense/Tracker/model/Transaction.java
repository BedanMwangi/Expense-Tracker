package com.example.Expense.Tracker.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Data;

import java.time.LocalDate;

@Entity
@Data
public class Transaction {
    @Id
    @GeneratedValue(strategy= GenerationType.IDENTITY)
    private Integer id;

    private String status;
    private String type;
    private LocalDate transactionDate;
    private double amount;
    private String category;

    // NEW: M-Pesa fields
    private String paymentMethod;
    private String mpesaReceiptNumber;
    private String mpesaPhoneNumber;
    private String transactionCode;
}
