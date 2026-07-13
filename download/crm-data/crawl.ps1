# crawl.ps1 v7 - Incremental crawl + handle query params
# Chạy: .\crawl.ps1

$ErrorActionPreference = "Continue"
$baseUrl = "https://my.easysalon.vn"
$sessionPath = "E:\crm-crawl\session.json"

# Set UTF-8
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Đọc URLs
$urls = Get-Content "E:\crm-crawl\urls.txt" -Encoding UTF8 | Where-Object { $_ -ne "" }
$total = $urls.Count
Write-Host "Found $total URLs in urls.txt" -ForegroundColor Yellow

# Load session
Write-Host "Loading session..." -ForegroundColor Cyan
$loadResult = agent-browser state load $sessionPath 2>&1
Write-Host "Session result: $loadResult" -ForegroundColor Gray

# Đợi browser khởi tạo
Start-Sleep -Seconds 3

$crawled = 0
$failed = 0
$skipped = 0

foreach ($url in $urls) {
    $idx = $crawled + $failed + $skipped + 1
    
    # Tạo tên file từ URL + xử lý query param
    # VD: /setting/commission-new?resourceMode=SELL_SERVICE
    #   → setting-commission-new-resourceMode-SELL_SERVICE
    $name = $url -replace "^$([regex]::Escape($baseUrl))/", "" 
    $name = $name -replace "/", "-"
    $name = $name -replace "\?", "-"
    $name = $name -replace "=", "-"
    $name = $name -replace "&", "-"
    
    if ($name -eq "" -or $name -eq $baseUrl) { $name = "home" }

    # ====== SKIP LOGIC ======
    $screenshotPath = "E:\crm-crawl\screenshots\$name.png"
    if (Test-Path $screenshotPath) {
        $fileSize = (Get-Item $screenshotPath).Length
        if ($fileSize -gt 1000) {
            Write-Host "[$idx/$total] SKIP (already crawled): $url" -ForegroundColor DarkGray
            $skipped++
            continue
        } else {
            Write-Host "[$idx/$total] RE-CRAWL (file too small): $url" -ForegroundColor Yellow
        }
    }
    # ========================

    Write-Host ""
    Write-Host "[$idx/$total] Crawling: $url -> $name" -ForegroundColor Cyan

    try {
        # Mở trang
        agent-browser open $url 2>&1 | Out-Default
        Start-Sleep -Seconds 3
        Start-Sleep -Seconds 2

        # Screenshot
        agent-browser screenshot "E:\crm-crawl\screenshots\$name.png" --full 2>&1 | Out-Default
        Write-Host "  [OK] Screenshot" -ForegroundColor Green

        # Snapshot -> file UTF-8
        $snapshot = agent-browser snapshot 2>&1
        $snapshot | Set-Content -Path "E:\crm-crawl\structure\$name.txt" -Encoding UTF8
        Write-Host "  [OK] Structure" -ForegroundColor Green

        # HTML -> file UTF-8
        $html = agent-browser eval "document.body.innerHTML" 2>&1
        $html | Set-Content -Path "E:\crm-crawl\html\$name.html" -Encoding UTF8
        Write-Host "  [OK] HTML" -ForegroundColor Green

        $crawled++
    } catch {
        Write-Host "  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "==========" -ForegroundColor Yellow
Write-Host "CRAWL COMPLETE" -ForegroundColor Green
Write-Host "==========" -ForegroundColor Yellow
Write-Host "Crawled (new): $crawled" -ForegroundColor Green
Write-Host "Skipped (already had screenshot): $skipped" -ForegroundColor DarkGray
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host ""
Write-Host "Total in urls.txt: $total" -ForegroundColor Yellow
