package com.example.Expense.Tracker.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class TransactionDTO {
    private String type;
    private double amount;
    private String category;
    private LocalDate transactionDate;

    private String paymentMethod;
    private String mpesaPhoneNumber;
}
