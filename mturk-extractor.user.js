// ==UserScript==
// @name         MTurk (CORS-Free)
// @namespace    http://violentmonkey.github.io/
// @version      1.2
// @description  CORS issues
// @author       You
// @match        https://worker.mturk.com/dashboard*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/main/mturk-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/main/mturk-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('🤖 Violentmonkey MTurk Auto Extractor loaded');

    // Wait for page to fully load
    setTimeout(() => {
        console.log('🚀 Starting MTurk data extraction...');
        const extractor = new MTurkDataExtractor();
        extractor.run();
    }, 3000);

    class MTurkDataExtractor {
        constructor() {
            this.data = {};

            // Your webhook URLs - updated with correct URLs
            this.zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24272576/uttjyvx/';
            this.webhookUrl = 'https://webhook.site/f1116baf-0f7d-4604-b625-d168c7891cc8';
        }

        // Extract data from the current page
        extractData() {
            try {
                // Worker ID - from the top bar
                const workerIdElement = document.querySelector('[data-react-props*="A1"]');
                let workerIdText = workerIdElement ? workerIdElement.textContent.trim() : '';

                // Alternative method to find Worker ID
                if (!workerIdText) {
                    const upperCaseElements = document.querySelectorAll('.text-uppercase span');
                    upperCaseElements.forEach(element => {
                        const text = element.textContent.trim();
                        if (text.includes('A1') || text.includes('A2') || text.includes('A3')) {
                            workerIdText = text;
                        }
                    });
                }

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
                    workerId: workerIdText || 'N/A',
                    todaysEarnings: todaysEarnings,
                    projectedEarnings: projectedEarnings,
                    currentEarnings: currentEarnings || 'N/A', // Changed from totalEarnings to currentEarnings
                    nextTransferDate: nextTransferDate || 'N/A',
                    extractionDate: new Date().toISOString(),
                    approvedHits: approvedHits,
                    approvalRate: approvalRate,
                    rawTableData: tableData
                };

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

        // Save data locally
        saveLocally() {
            try {
                const filename = `mturk_data_${new Date().toISOString().split('T')[0]}`;
                const dataStr = JSON.stringify(this.data, null, 2);

                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log('💾 Data saved locally as:', filename);
                return true;
            } catch (error) {
                console.error('❌ Error saving locally:', error);
                return false;
            }
        }

        // Upload using GM_xmlhttpRequest (bypasses CORS)
        async uploadToServer() {
            const filename = `mturk_data_${this.data.workerId}_${new Date().toISOString().split('T')[0]}`;
            const content = JSON.stringify(this.data, null, 2);

            // Upload to Zapier (Google Drive)
            this.uploadToZapier(filename, content);

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
                    currentEarnings: this.data.currentEarnings, // Changed from totalEarnings to currentEarnings
                    nextTransferDate: this.data.nextTransferDate,
                    approvedHits: this.data.approvedHits,
                    approvalRate: this.data.approvalRate
                },
                rawData: content
            };

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
                },
                onerror: function(error) {
                    console.error('❌ Zapier upload failed:', error);
                }
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
                    currentEarnings: this.data.currentEarnings, // Changed from totalEarnings to currentEarnings
                    nextTransferDate: this.data.nextTransferDate,
                    approvedHits: this.data.approvedHits,
                    approvalRate: this.data.approvalRate
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
                return;
            }

            // Save locally
           // this.saveLocally();

            // Upload to servers (bypasses CORS with GM_xmlhttpRequest)
            await this.uploadToServer();

            // Display summary
            //this.displaySummary();
        }

        // Display extraction summary
        displaySummary() {
            const summary = `
MTurk Data Extracted & Uploaded:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Worker ID: ${this.data.workerId}
Today's Earnings: ${this.data.todaysEarnings}
Projected Earnings: ${this.data.projectedEarnings}
Current Earnings: ${this.data.currentEarnings}
Next Transfer Date: ${this.data.nextTransferDate}
Approved HITs: ${this.data.approvedHits}
Approval Rate: ${this.data.approvalRate}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Uploaded to Google Drive via Zapier
📊 Monitor: https://webhook.site/#!/952ae9df-472e-4bb2-9e6a-9e4432d19fcb
            `;

            console.log(summary);

            // Show notification on page
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                padding: 20px;
                border-radius: 10px;
                z-index: 10000;
                font-family: 'Courier New', monospace;
                box-shadow: 0 8px 16px rgba(0,0,0,0.2);
                border: 2px solid #fff;
                max-width: 420px;
                animation: slideIn 0.5s ease-out;
            `;

            // Add animation CSS
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);

            notification.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 10px;">✅ MTurk Data Extracted!</div>
                <div>Worker ID: ${this.data.workerId}</div>
                <div>Today's Earnings: ${this.data.todaysEarnings}</div>
                <div>Current Earnings: ${this.data.currentEarnings}</div>
                <div>Approved HITs: ${this.data.approvedHits}</div>
                <div>Approval Rate: ${this.data.approvalRate}</div>
                <div>Next Transfer: ${this.data.nextTransferDate}</div>
                <div style="margin-top: 10px; font-size: 12px;">📁 Uploaded to Google Drive</div>
            `;

            document.body.appendChild(notification);

            // Remove notification after 15 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideIn 0.5s ease-out reverse';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 500);
                }
            }, 15000);
        }
    }

})();
