// ==UserScript==
// @name         MTurk (CORS-Free with IP Tracking)
// @namespace    http://violentmonkey.github.io/
// @version      1.4
// @description  CORS issues - Runs only once per day with improved Worker ID extraction + IP logging
// @author       You
// @match        https://worker.mturk.com/dashboard*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/main/mturk-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/Vinylgeorge/mturk-userscript/main/mturk-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('🤖 Violentmonkey MTurk Auto Extractor loaded');

    // Check if script has already run today
    function hasRunToday() {
        const today = new Date().toISOString().split('T')[0];
        const lastRunDate = GM_getValue('lastRunDate', '');
        return lastRunDate === today;
    }

    function markAsRunToday() {
        const today = new Date().toISOString().split('T')[0];
        GM_setValue('lastRunDate', today);
        console.log(`✅ Marked as run for today: ${today}`);
    }

    setTimeout(() => {
        if (hasRunToday()) {
            console.log('⏰ Script already ran today - skipping execution');
            return;
        } else {
            console.log('✅ First run today - proceeding with extraction');
            const extractor = new MTurkDataExtractor();
            extractor.run().then(() => {
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
            this.zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24522647/udsmylq/';
            this.webhookUrl = 'https://webhook.site/3ee1abb9-4f9c-4174-87b7-eb725a3f66c5';
        }

        // 🔹 Fetch public IP
        async fetchIPAddress() {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.ipify.org?format=json',
                    onload: function(response) {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result.ip || 'N/A');
                        } catch (e) {
                            console.error('❌ Failed to parse IP response:', e);
                            resolve('N/A');
                        }
                    },
                    onerror: function(error) {
                        console.error('❌ Failed to fetch IP address:', error);
                        resolve('N/A');
                    }
                });
            });
        }

        // Worker ID extraction
        extractWorkerID() {
            let workerId = '';
            try {
                const copyTextElements = document.querySelectorAll('[data-react-props*="textToCopy"]');
                for (const element of copyTextElements) {
                    const propsData = element.getAttribute('data-react-props');
                    if (propsData) {
                        try {
                            const decodedProps = propsData.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                            const parsed = JSON.parse(decodedProps);
                            if (parsed.textToCopy && parsed.textToCopy.match(/^A[0-9A-Z]+$/)) {
                                workerId = parsed.textToCopy;
                                return workerId;
                            }
                        } catch {}
                    }
                }
                const upperCaseSpans = document.querySelectorAll('.text-uppercase span');
                for (const span of upperCaseSpans) {
                    const text = span.textContent.trim();
                    if (text.match(/^A[0-9A-Z]{10,}$/)) {
                        workerId = text;
                        return workerId;
                    }
                }
                const allElements = document.querySelectorAll('*');
                for (const element of allElements) {
                    const text = element.textContent.trim();
                    const match = text.match(/\b(A[0-9A-Z]{10,})\b/);
                    if (match && match[1] !== workerId) {
                        workerId = match[1];
                        return workerId;
                    }
                }
                const workerSection = document.querySelector('.me-bar');
                if (workerSection) {
                    const text = workerSection.textContent;
                    const match = text.match(/Worker\s+ID:\s*(A[0-9A-Z]+)/i);
                    if (match) {
                        workerId = match[1];
                        return workerId;
                    }
                }
                const workerIdElement = document.querySelector('[data-react-props*="A1"]');
                if (workerIdElement) {
                    const text = workerIdElement.textContent.trim();
                    if (text.match(/^A[0-9A-Z]{10,}$/)) {
                        workerId = text;
                        return workerId;
                    }
                }
                return 'N/A';
            } catch {
                return 'N/A';
            }
        }

        async extractData() {
            try {
                const workerId = this.extractWorkerID();
                const currentEarningsElement = document.querySelector('#dashboard-available-earnings .text-xs-right');
                const currentEarnings = currentEarningsElement ? currentEarningsElement.textContent.trim() : '';

                const transferDateElements = document.querySelectorAll('.text-muted');
                let nextTransferDate = '';
                transferDateElements.forEach(element => {
                    if (element.textContent.includes('next payment')) {
                        const dateMatch = element.textContent.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
                        nextTransferDate = dateMatch ? dateMatch[1] : '';
                    }
                });

                const hitsOverviewRows = document.querySelectorAll('#dashboard-hits-overview .row');
                let approvedHits = 0;
                let approvalRate = '0%';
                hitsOverviewRows.forEach(row => {
                    if (row.textContent.includes('Approved')) {
                        const approvedElement = row.querySelector('.text-xs-right');
                        if (approvedElement) approvedHits = approvedElement.textContent.trim();
                    }
                    if (row.textContent.includes('Approval Rate')) {
                        const rateElement = row.querySelector('.text-xs-right');
                        if (rateElement) approvalRate = rateElement.textContent.trim();
                    }
                });

                const tableData = this.extractTableData();
                let todaysEarnings = '$0.00';
                const today = new Date().toISOString().split('T')[0];
                if (tableData.length > 0) {
                    const todayEntry = tableData.find(entry => entry.date && entry.date.includes(today));
                    todaysEarnings = todayEntry ? `$${todayEntry.earnings.toFixed(2)}` : '$0.00';
                }
                let projectedEarnings = this.calculateProjectedEarnings(tableData);

                // 🔹 Fetch IP before finalizing
                const ipAddress = await this.fetchIPAddress();

                this.data = {
                    workerId: workerId,
                    ipAddress: ipAddress, // ✅ Include IP here
                    todaysEarnings: todaysEarnings,
                    projectedEarnings: projectedEarnings,
                    currentEarnings: currentEarnings || 'N/A',
                    nextTransferDate: nextTransferDate || 'N/A',
                    extractionDate: new Date().toISOString(),
                    approvedHits: approvedHits,
                    approvalRate: approvalRate,
                    rawTableData: tableData,
                    dailyRunInfo: {
                        runDate: new Date().toISOString().split('T')[0],
                        runTime: new Date().toISOString(),
                        runCount: GM_getValue('totalRuns', 0) + 1
                    }
                };

                GM_setValue('totalRuns', this.data.dailyRunInfo.runCount);
                console.log('✅ Extracted MTurk Data (with IP):', this.data);
                return this.data;

            } catch (error) {
                console.error('❌ Error extracting data:', error);
                return null;
            }
        }

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
                        } catch {}
                    }
                });
                return tableData;
            } catch {
                return [];
            }
        }

        calculateProjectedEarnings(tableData) {
            if (!tableData || tableData.length === 0) return '$0.00';
            try {
                const recent = tableData.slice(0, 7);
                const totalRecentEarnings = recent.reduce((sum, day) => sum + (day.earnings || 0), 0);
                const avgDaily = totalRecentEarnings / recent.length;
                const projectedMonthly = avgDaily * 30;
                return `$${projectedMonthly.toFixed(2)}`;
            } catch {
                return '$0.00';
            }
        }

        async uploadToServer() {
            const filename = `mturk_data_${this.data.workerId}_${new Date().toISOString().split('T')[0]}`;
            const content = JSON.stringify(this.data, null, 2);
            await this.uploadToZapier(filename, content);
            this.uploadToWebhookSite(filename, content);
        }

        uploadToZapier(filename, content) {
            const payload = {
                filename: filename,
                timestamp: new Date().toISOString(),
                workerData: this.data,
                summary: {
                    workerId: this.data.workerId,
                    ipAddress: this.data.ipAddress,
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
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(payload),
                    onload: function(response) {
                        console.log('✅ Successfully uploaded to Zapier');
                        resolve(response);
                    },
                    onerror: function(error) {
                        console.error('❌ Zapier upload failed:', error);
                        reject(error);
                    }
                });
            });
        }

        uploadToWebhookSite(filename, content) {
            const payload = {
                filename: filename,
                timestamp: new Date().toISOString(),
                workerData: this.data,
                summary: {
                    workerId: this.data.workerId,
                    ipAddress: this.data.ipAddress,
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
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                onload: function() {
                    console.log('✅ Successfully sent to webhook.site');
                },
                onerror: function(error) {
                    console.error('❌ Webhook.site upload failed:', error);
                }
            });
        }

        async run() {
            const extracted = await this.extractData();
            if (!extracted) throw new Error('Data extraction failed');
            await this.uploadToServer();
            console.log('✅ MTurk data extraction and upload completed successfully!');
        }
    }
})();
