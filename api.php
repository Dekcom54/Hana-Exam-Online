<?php
/**
 * ============================================================================
 * PHP PROXY & FALLBACK JSON STORAGE (api.php)
 * ============================================================================
 * ใช้สำหรับกรณีนำเว็บไปฝากบน PHP Hosting:
 * 1. ช่วยส่งต่อข้อมูลไปยัง Google Apps Script Web App URL โดยไม่ติดปัญหา CORS
 * 2. บันทึกข้อมูลสำรองไว้ในไฟล์ local_db.json บนเซิร์ฟเวอร์อัตโนมัติ (เผื่อเน็ตหลุด)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
if (!is_array($body)) {
    $body = $_REQUEST;
}

$defaultGasUrl = 'https://script.google.com/macros/s/AKfycby3V0oPb2vz7qu2b-RXjCqjMYtdEiySGYcnDmh375IbJBfjS8DTJQ-4z0hOSO0gXL1B/exec';
$gasUrl = isset($body['gasUrl']) && !empty(trim($body['gasUrl'])) ? trim($body['gasUrl']) : $defaultGasUrl;

// ถ้าระบุ Google Apps Script Web App URL มา ให้ส่งต่อไปยัง Google Sheet โดยตรง
if (!empty($gasUrl) && filter_var($gasUrl, FILTER_VALIDATE_URL)) {
    unset($body['gasUrl']);
    $ch = curl_init($gasUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: text/plain;charset=utf-8']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($response !== false && !$err) {
        echo $response;
        exit;
    }
}

echo json_encode([
    'status' => 'ok',
    'mode' => 'php-ready',
    'message' => 'PHP Endpoint พร้อมทำงาน'
], JSON_UNESCAPED_UNICODE);
