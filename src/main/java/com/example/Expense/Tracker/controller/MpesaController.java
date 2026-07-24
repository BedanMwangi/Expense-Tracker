package com.example.Expense.Tracker.controller;

import com.example.Expense.Tracker.model.Transaction;
import com.example.Expense.Tracker.service.MpesaService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/mpesa")
@CrossOrigin(origins = "http://localhost:5173")
public class MpesaController {

    @Autowired
    private MpesaService mpesaService;

    @PostMapping("/stk-push")
    public Map<String, Object> initiatePayment(
            @RequestParam String phoneNumber,
            @RequestParam double amount,
            @RequestParam String accountReference) {

        try {
            Transaction transaction = mpesaService.initiateStkPush(
                    phoneNumber, amount, accountReference);

            return Map.of(
                    "status", "success",
                    "message", "STK Push sent to " + phoneNumber,
                    "transactionId", transaction.getId(),
                    "checkoutRequestId", transaction.getTransactionCode()
            );
        } catch (Exception e) {
            return Map.of(
                    "status", "error",
                    "message", e.getMessage()
            );
        }
    }
    @PostMapping("/callback")
    public void mpesaCallback(
            @RequestBody Map<String,Object> callback){

        Map body = (Map) callback.get("Body");

        Map stkCallback =
                (Map) body.get("stkCallback");


        String checkoutId =
                (String) stkCallback.get("CheckoutRequestID");


        Transaction transaction =
                mpesaService.findByCheckoutId(checkoutId);


        Integer resultCode =
                (Integer) stkCallback.get("ResultCode");


        if(resultCode == 0){

            transaction.setStatus("COMPLETED");

        }else{

            transaction.setStatus("FAILED");

        }


        // save updated status
    }
}