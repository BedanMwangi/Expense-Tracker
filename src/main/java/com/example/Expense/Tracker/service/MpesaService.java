package com.example.Expense.Tracker.service;

import com.example.Expense.Tracker.model.Transaction;
import com.example.Expense.Tracker.dao.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class MpesaService {

    @Value("${mpesa.consumer.key}")
    private String consumerKey;

    @Value("${mpesa.consumer.secret}")
    private String consumerSecret;

    @Value("${mpesa.shortcode}")
    private String shortcode;

    @Value("${mpesa.passkey}")
    private String passkey;

    @Value("${mpesa.callback.url}")
    private String callbackUrl;

    @Value("${mpesa.base.url}")
    private String baseUrl;

    @Autowired
    private TransactionRepository transactionRepo;

    private final RestTemplate restTemplate = new RestTemplate();
    private String cachedAccessToken;
    private long tokenExpiryTime;

    // 1. Get OAuth Token
    public String getAccessToken() {
        long now = System.currentTimeMillis();

        if (cachedAccessToken != null && now < tokenExpiryTime - 300000) {
            return cachedAccessToken;
        }

        try {
            String auth = consumerKey + ":" + consumerSecret;
            String encodedAuth = Base64.getEncoder()
                    .encodeToString(auth.getBytes(StandardCharsets.UTF_8));

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Basic " + encodedAuth);
            headers.set("Accept", MediaType.APPLICATION_JSON_VALUE);

            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/oauth/v1/generate?grant_type=client_credentials",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class
            );

            cachedAccessToken = (String) response.getBody().get("access_token");
            tokenExpiryTime = now + 3600000;

            return cachedAccessToken;
        } catch (Exception e) {
            throw new RuntimeException("Failed to get M-Pesa token", e);
        }
    }

    // 2. Initiate STK Push
    public Transaction initiateStkPush(String phoneNumber, double amount, String accountReference) {
        try {
            String accessToken = getAccessToken();
            String password = generatePassword();
            String timestamp = generateTimestamp();
            String normalizedPhone = normalizePhoneNumber(phoneNumber);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("BusinessShortCode", shortcode);
            requestBody.put("Password", password);
            requestBody.put("Timestamp", timestamp);
            requestBody.put("TransactionType", "CustomerPayBillOnline");
            requestBody.put("Amount", (int) amount);
            requestBody.put("PartyA", normalizedPhone);
            requestBody.put("PartyB", shortcode);
            requestBody.put("PhoneNumber", normalizedPhone);
            requestBody.put("CallBackURL", callbackUrl);
            requestBody.put("AccountReference", accountReference);
            requestBody.put("TransactionDesc", accountReference);

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + accessToken);
            headers.set("Content-Type", MediaType.APPLICATION_JSON_VALUE);

            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/mpesa/stkpush/v1/processrequest",
                    HttpMethod.POST,
                    new HttpEntity<>(requestBody, headers),
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();

            // Save pending transaction
            Transaction transaction = new Transaction();
            transaction.setType("EXPENSE");
            transaction.setAmount(amount);
            transaction.setCategory("M-Pesa Payment");
            transaction.setTransactionDate(LocalDate.now());
            transaction.setPaymentMethod("MPESA");
            transaction.setMpesaPhoneNumber(normalizedPhone);
            transaction.setTransactionCode(
                    (String) responseBody.get("CheckoutRequestID")
            );

            transaction.setStatus("PENDING");

            return transactionRepo.save(transaction);

        } catch (Exception e) {
            throw new RuntimeException("STK Push failed", e);
        }
    }

    // 3. Generate Password
    private String generatePassword() {
        String timestamp = LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String password = shortcode + passkey + timestamp;
        return Base64.getEncoder().encodeToString(password.getBytes(StandardCharsets.UTF_8));
    }

    // 4. Generate Timestamp
    private String generateTimestamp() {
        return LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
    }

    // 5. Normalize Phone Number
    private String normalizePhoneNumber(String phone) {
        String cleaned = phone.replaceAll("[\\s\\-+]", "");
        if (cleaned.startsWith("0")) {
            cleaned = "254" + cleaned.substring(1);
        } else if (!cleaned.startsWith("254")) {
            cleaned = "254" + cleaned;
        }
        return cleaned;
    }

    public Transaction findByCheckoutId(String checkoutId){

        return transactionRepo
                .findByTransactionCode(checkoutId);

    }
    public void updateTransactionStatus(
            String checkoutId,
            String status){

        Transaction transaction =
                transactionRepo.findByTransactionCode(checkoutId);

        if (transaction == null) {
            throw new RuntimeException("Transaction not found with checkout ID " + checkoutId);
        }

        transaction.setStatus(status);

        transactionRepo.save(transaction);
    }
}
