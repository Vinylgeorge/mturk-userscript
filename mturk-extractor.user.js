// ==UserScript==
// @name         MTurk (CORS-Free)
// @namespace    http://violentmonkey.github.io/
// @version      1.2
// @description  CORS issues - Runs only once per day with improved Worker ID extraction
// @author       You
// @match        https://worker.mturk.com/dashboard*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/refs/heads/main/mturk-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/refs/heads/main/mturk-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('🤖 Violentmonkey MTurk Auto Extractor loaded');

    // Check if script has already run today
    function hasRunToday() {
        const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        const lastRunDate = GM_getValue('lastRunDate', '');
        
        console.log(`📅 Today: ${today}, Last run: ${lastRunDate}`);
        
        return lastRunDate === today;
    }

    // Mark script as run for today
    function markAsRunToday() {
        const today = new Date().toISOString().split('T')[0];
        GM_setValue('lastRunDate', today);
        console.log(`✅ Marked as run for today: ${today}`);
    }

    // Main initialization
    setTimeout(() => {
        if (hasRunToday()) {
            console.log('⏰ Script already ran today - skipping execution');
            return;
        } else {
            console.log('✅ First run today - proceeding with extraction');
            console.log('🚀 Starting MTurk data extraction...');
            const extractor = new MTurkDataExtractor();
            extractor.run().then(() => {
                // Mark as run today after successful extraction
                markAsRunToday();
                console.log('✅ MTurk data extraction completed and marked as run for today');
            }).catch((error) => {
                console.error('❌ Extraction failed:', error);
            });
        }
    }, 3000);

    class MTurkDataExtractor {
        constructor() {
            this.data = {};

            // Your webhook URLs - updated with correct URLs
            this.zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24388336/uhd35sb/';
            this.webhookUrl = 'https://webhook.site/f1116baf-0f7d-4604-b625-d168c7891cc8';
        }

        // Improved Worker ID extraction
        extractWorkerID() {
            let workerId = '';
            
            try {
                // Method 1: Look for data-react-props containing textToCopy
                const copyTextElements = document.querySelectorAll('[data-react-props*="textToCopy"]');
                for (const element of copyTextElements) {
                    const propsData = element.getAttribute('data-react-props');
                    if (propsData) {
                        try {
                            // Decode HTML entities first
                            const decodedProps = propsData.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                            const parsed = JSON.parse(decodedProps);
                            if (parsed.textToCopy && parsed.textToCopy.match(/^A[0-9A-Z]+$/)) {
                                workerId = parsed.textToCopy;
                                console.log('✅ Worker ID found via data-react-props:', workerId);
                                return workerId;
                            }
                        } catch (e) {
                            console.log('Could not parse React props for worker ID:', e);
                        }
                    }
                }

                // Method 2: Look for text content in .text-uppercase span
                const upperCaseSpans = document.querySelectorAll('.text-uppercase span');
                for (const span of upperCaseSpans) {
                    const text = span.textContent.trim();
                    if (text.match(/^A[0-9A-Z]{10,}$/)) {
                        workerId = text;
                        console.log('✅ Worker ID found via .text-uppercase span:', workerId);
                        return workerId;
                    }
                }

                // Method 3: Look for any element containing worker ID pattern
                const allElements = document.querySelectorAll('*');
                for (const element of allElements) {
                    const text = element.textContent.trim();
                    const match = text.match(/\b(A[0-9A-Z]{10,})\b/);
                    if (match && match[1] !== workerId) {
                        workerId = match[1];
                        console.log('✅ Worker ID found via text pattern:', workerId);
                        return workerId;
                    }
                }

                // Method 4: Check specific MTurk structure
                const workerSection = document.querySelector('.me-bar');
                if (workerSection) {
                    const text = workerSection.textContent;
                    const match = text.match(/Worker\s+ID:\s*(A[0-9A-Z]+)/i);
                    if (match) {
                        workerId = match[1];
                        console.log('✅ Worker ID found via Worker ID label:', workerId);
                        return workerId;
                    }
                }

                // Method 5: Fallback - Original method for backward compatibility
                const workerIdElement = document.querySelector('[data-react-props*="A1"]');
                if (workerIdElement) {
                    const text = workerIdElement.textContent.trim();
                    if (text.match(/^A[0-9A-Z]{10,}$/)) {
                        workerId = text;
                        console.log('✅ Worker ID found via fallback method:', workerId);
                        return workerId;
                    }
                }

                console.log('❌ Worker ID not found with any method');
                return 'N/A';

            } catch (error) {
                console.error('❌ Error extracting worker ID:', error);
                return 'N/A';
            }
        }

        // Extract data from the current page
        extractData() {
            try {
                // Worker ID - using improved extraction
                const workerId = this.extractWorkerID();

                // Current Earnings - from the earnings section (updated extraction)
                const currentEarningsElement = document.querySelector('#dashboard-available-earnings .text-xs-right');
                const currentEarnings = currentEarningsElement ? currentEarningsElement.textContent.trim() : '';

                // Next Transfer Date - from earnings section
                const transferDateElements = document.querySelectorAll('.text-muted');
                let nextTransferDate = '';
                transferDateElements.forEach(element => {
                    if (element.textContent.includes('next payment')) {
                        const dateMatch = element.textContent.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
                        nextTransferDate = dateMatch ? dateMatch[1] : '';
                    }
                });

                // HITs Overview - from dashboard
                const hitsOverviewRows = document.querySelectorAll('#dashboard-hits-overview .row');
                let approvedHits = 0;
                let approvalRate = '0%';

                hitsOverviewRows.forEach(row => {
                    if (row.textContent.includes('Approved')) {
                        const approvedElement = row.querySelector('.text-xs-right');
                        if (approvedElement) {
                            approvedHits = approvedElement.textContent.trim();
                        }
                    }
                    if (row.textContent.includes('Approval Rate')) {
                        const rateElement = row.querySelector('.text-xs-right');
                        if (rateElement) {
                            approvalRate = rateElement.textContent.trim();
                        }
                    }
                });

                // Today's Earnings - calculate from recent activity
                const today = new Date().toISOString().split('T')[0];
                let todaysEarnings = '$0.00';

                // Try to find today's earnings from the daily statistics table
                const tableData = this.extractTableData();
                if (tableData.length > 0) {
                    const todayEntry = tableData.find(entry =>
                        entry.date && entry.date.includes(today)
                    );
                    todaysEarnings = todayEntry ? `$${todayEntry.earnings.toFixed(2)}` : '$0.00';
                }

                // Projected Earnings - simple calculation based on recent average
                let projectedEarnings = this.calculateProjectedEarnings(tableData);

                this.data = {
                    workerId: workerId,
                    todaysEarnings: todaysEarnings,
                    projectedEarnings: projectedEarnings,
                    currentEarnings: currentEarnings || 'N/A',
                    nextTransferDate: nextTransferDate || 'N/A',
                    extractionDate: new Date().toISOString(),
                    approvedHits: approvedHits,
                    approvalRate: approvalRate,
                    rawTableData: tableData,
                    // Add run tracking info
                    dailyRunInfo: {
                        runDate: new Date().toISOString().split('T')[0],
                        runTime: new Date().toISOString(),
                        runCount: GM_getValue('totalRuns', 0) + 1
                    }
                };

                // Update total run count
                GM_setValue('totalRuns', this.data.dailyRunInfo.runCount);

                console.log('✅ Extracted MTurk Data:', this.data);
                return this.data;

            } catch (error) {
                console.error('❌ Error extracting data:', error);
                return null;
            }
        }

        // Extract table data for analysis
        extractTableData() {
            try {
                const reactElements = document.querySelectorAll('[data-react-props]');
                let tableData = [];

                reactElements.forEach(element => {
                    const propsData = element.getAttribute('data-react-props');
                    if (propsData && propsData.includes('bodyData')) {
                        try {
                            const parsed = JSON.parse(propsData);
                            if (parsed.bodyData && Array.isArray(parsed.bodyData)) {
                                tableData = parsed.bodyData;
                            }
                        } catch (e) {
                            console.log('Could not parse React props:', e);
                        }
                    }
                });

                return tableData;
            } catch (error) {
                console.error('Error extracting table data:', error);
                return [];
            }
        }

        // Calculate projected earnings based on recent performance
        calculateProjectedEarnings(tableData) {
            if (!tableData || tableData.length === 0) return '$0.00';

            try {
                const recent = tableData.slice(0, 7);
                const totalRecentEarnings = recent.reduce((sum, day) => sum + (day.earnings || 0), 0);
                const avgDaily = totalRecentEarnings / recent.length;
                const projectedMonthly = avgDaily * 30;
                return `$${projectedMonthly.toFixed(2)}`;
            } catch (error) {
                return '$0.00';
            }
        }

        // Upload using GM_xmlhttpRequest (bypasses CORS)
        async uploadToServer() {
            const filename = `mturk_data_${this.data.workerId}_${new Date().toISOString().split('T')[0]}`;
            const content = JSON.stringify(this.data, null, 2);

            // Upload to Zapier (Google Drive)
            await this.uploadToZapier(filename, content);

            // Upload to webhook.site (monitoring)
            this.uploadToWebhookSite(filename, content);
        }

        // Upload to Zapier using Violentmonkey's GM_xmlhttpRequest
        uploadToZapier(filename, content) {
            const payload = {
                filename: filename,
                timestamp: new Date().toISOString(),
                workerData: this.data,
                summary: {
                    workerId: this.data.workerId,
                    todaysEarnings: this.data.todaysEarnings,
                    projectedEarnings: this.data.projectedEarnings,
                    currentEarnings: this.data.currentEarnings,
                    nextTransferDate: this.data.nextTransferDate,
                    approvedHits: this.data.approvedHits,
                    approvalRate: this.data.approvalRate,
                    dailyRunInfo: this.data.dailyRunInfo
                },
                rawData: content
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.zapierWebhookUrl,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(payload),
                    onload: function(response) {
                        console.log('✅ Successfully uploaded to Zapier → Google Drive!');
                        console.log('Response:', response.responseText);
                        resolve(response);
                    },
                    onerror: function(error) {
                        console.error('❌ Zapier upload failed:', error);
                        reject(error);
                    }
                });
            });
        }

        // Upload to webhook.site for monitoring
        uploadToWebhookSite(filename, content) {
            const payload = {
                filename: filename,
                timestamp: new Date().toISOString(),
                workerData: this.data,
                summary: {
                    workerId: this.data.workerId,
                    todaysEarnings: this.data.todaysEarnings,
                    projectedEarnings: this.data.projectedEarnings,
                    currentEarnings: this.data.currentEarnings,
                    nextTransferDate: this.data.nextTransferDate,
                    approvedHits: this.data.approvedHits,
                    approvalRate: this.data.approvalRate,
                    dailyRunInfo: this.data.dailyRunInfo
                },
                rawData: content
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: this.webhookUrl,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    console.log('✅ Successfully sent to webhook.site for monitoring!');
                },
                onerror: function(error) {
                    console.error('❌ Webhook.site upload failed:', error);
                }
            });
        }

        // Main execution function
        async run() {
            console.log('🚀 Starting MTurk data extraction...');

            // Extract data
            const extracted = this.extractData();
            if (!extracted) {
                console.error('❌ Failed to extract data');
                throw new Error('Data extraction failed');
            }

            // Upload to servers (bypasses CORS with GM_xmlhttpRequest)
            await this.uploadToServer();

            console.log('✅ MTurk data extraction and upload completed successfully!');
        }
    }

})();
