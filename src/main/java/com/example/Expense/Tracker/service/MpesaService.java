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
        validateMpesaConfig();
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

            Map responseBody = response.getBody();
            if (responseBody == null || responseBody.get("access_token") == null) {
                throw new RuntimeException("M-Pesa did not return an access token");
            }

            cachedAccessToken = (String) responseBody.get("access_token");
            tokenExpiryTime = now + 3600000;

            return cachedAccessToken;
        } catch (Exception e) {
            throw new RuntimeException("Failed to get M-Pesa token: " + getRootMessage(e), e);
        }
    }

    // 2. Initiate STK Push
    public Transaction initiateStkPush(String phoneNumber, double amount, String accountReference) {
        try {
            if (amount < 1) {
                throw new RuntimeException("M-Pesa amount must be at least 1 KES");
            }

            String accessToken = getAccessToken();
            String timestamp = generateTimestamp();
            String password = generatePassword(timestamp);
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
            if (responseBody == null || responseBody.get("CheckoutRequestID") == null) {
                throw new RuntimeException("M-Pesa did not return a checkout request ID");
            }

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
            throw new RuntimeException("STK Push failed: " + getRootMessage(e), e);
        }
    }

    public Transaction queryAndSyncStkStatus(String checkoutId) {
        if (isBlank(checkoutId)) {
            throw new RuntimeException("Checkout request ID is required");
        }

        Transaction transaction = findByCheckoutId(checkoutId);
        if (transaction == null) {
            throw new RuntimeException("Transaction not found with checkout ID " + checkoutId);
        }

        try {
            String accessToken = getAccessToken();
            String timestamp = generateTimestamp();
            String password = generatePassword(timestamp);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("BusinessShortCode", shortcode);
            requestBody.put("Password", password);
            requestBody.put("Timestamp", timestamp);
            requestBody.put("CheckoutRequestID", checkoutId);

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + accessToken);
            headers.set("Content-Type", MediaType.APPLICATION_JSON_VALUE);

            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/mpesa/stkpushquery/v1/query",
                    HttpMethod.POST,
                    new HttpEntity<>(requestBody, headers),
                    Map.class
            );

            Map responseBody = response.getBody();
            if (responseBody == null || responseBody.get("ResultCode") == null) {
                throw new RuntimeException("M-Pesa did not return a status result");
            }

            transaction.setStatus(mapResultCodeToStatus(responseBody.get("ResultCode")));
            return transactionRepo.save(transaction);
        } catch (Exception e) {
            throw new RuntimeException("Could not query M-Pesa status: " + getRootMessage(e), e);
        }
    }

    // 3. Generate Password
    private String generatePassword(String timestamp) {
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
        if (phone == null || phone.isBlank()) {
            throw new RuntimeException("Phone number is required");
        }

        String cleaned = phone.replaceAll("[\\s\\-+]", "");
        if (cleaned.startsWith("0")) {
            cleaned = "254" + cleaned.substring(1);
        } else if (!cleaned.startsWith("254")) {
            cleaned = "254" + cleaned;
        }

        if (!cleaned.matches("2547\\d{8}")) {
            throw new RuntimeException("Phone number must be a valid Kenyan mobile number, for example 0712345678");
        }

        return cleaned;
    }

    private void validateMpesaConfig() {
        if (isBlank(consumerKey)) {
            throw new RuntimeException("Missing mpesa.consumer.key. Set MPESA_CONSUMER_KEY or update application.properties");
        }
        if (isBlank(consumerSecret)) {
            throw new RuntimeException("Missing mpesa.consumer.secret. Set MPESA_CONSUMER_SECRET or update application.properties");
        }
        if (isBlank(passkey)) {
            throw new RuntimeException("Missing mpesa.passkey. Set MPESA_PASSKEY or update application.properties");
        }
        if (isBlank(callbackUrl) || callbackUrl.contains("your-domain.com")) {
            throw new RuntimeException("Missing public mpesa.callback.url. Set MPESA_CALLBACK_URL to a reachable HTTPS callback URL");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String getRootMessage(Throwable throwable) {
        Throwable root = throwable;
        while (root.getCause() != null) {
            root = root.getCause();
        }

        return root.getMessage() == null ? root.getClass().getSimpleName() : root.getMessage();
    }

    public String mapResultCodeToStatus(Object resultCodeValue) {
        int resultCode;
        if (resultCodeValue instanceof Number number) {
            resultCode = number.intValue();
        } else {
            resultCode = Integer.parseInt(resultCodeValue.toString());
        }

        if (resultCode == 0) {
            return "COMPLETED";
        }
        if (resultCode == 1032) {
            return "CANCELLED";
        }

        return "FAILED";
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
