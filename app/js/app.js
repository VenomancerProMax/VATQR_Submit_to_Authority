// -----------------------------
// Global state / varialbles
// -----------------------------
let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;
let cachedFilePayment = null;
let cachedBase64Payment = null;

// New global variables to hold account data for Pay GIBAN
let legalNameTaxablePerson;
let vat_pay_giban_account;
let ctTrn;
let taxPeriodVat;

// -----------------------------
// PageLoad - populate form
// -----------------------------
ZOHO.embeddedApp.on("PageLoad", async (entity) => {
    try {
        const entity_id = entity.EntityId;
        const appResponse = await ZOHO.CRM.API.getRecord({
            Entity: "Applications1",
            approved: "both",
            RecordID: entity_id,
        });
        const applicationData = appResponse.data[0];
        app_id = applicationData.id;
        account_id = applicationData.Account_Name.id;

        const accountResponse = await ZOHO.CRM.API.getRecord({
            Entity: "Accounts",
            approved: "both",
            RecordID: account_id,
        });

        const accountData = accountResponse.data[0];

        legalNameTaxablePerson = accountData.Legal_Name_of_Taxable_Person;
        // Updated to use the variable from the account data
        vat_pay_giban_account = accountData.VAT_Pay_GIBAN; 
        ctTrn = accountData.TRN_Number;
        taxPeriodVat = accountData.Tax_Period_VAT_QTR;

        document.getElementById("name-of-taxable-person").value = legalNameTaxablePerson || "";
        document.getElementById("tax-registration-number").value = ctTrn || "";
        document.getElementById("tax-period-vat").value = taxPeriodVat || "";
        
        // Populate the Pay GIBAN field here using the global variable
        document.getElementById("pay-giban").value = vat_pay_giban_account || "";

        updateTaxPeriodEnding();
        checkTaxAndToggleVisibility(); // Call after populating fields

        ZOHO.CRM.UI.Resize({ height: "100%" }).then(function (data) {
            console.log("Resize result:", data);
        });
    } catch (err) {
        console.error(err);
    }
});

// -----------------------------
// Small UI helpers & validators
// -----------------------------
function clearErrors() {
    document.querySelectorAll(".error-message").forEach((span) => {
        span.textContent = "";
    });
}

function showError(fieldId, message) {
    const errorSpan = document.getElementById(`error-${fieldId}`);
    if (errorSpan) errorSpan.textContent = message;
}

function showUploadBuffer() {
    const buffer = document.getElementById("upload-buffer");
    const bar = document.getElementById("upload-progress");
    if (buffer) buffer.classList.remove("hidden");
    if (bar) {
        bar.classList.remove("animate");
        void bar.offsetWidth;
        bar.classList.add("animate");
    }
}

function hideUploadBuffer() {
    const buffer = document.getElementById("upload-buffer");
    if (buffer) buffer.classList.add("hidden");
}

// -----------------------------
// Tax period display logic
// -----------------------------
function updateTaxPeriodEnding() {
    try {
        const taxPeriodValue = document.getElementById("tax-period-vat")?.value;
        const targetField = document.getElementById("tax-period-ending");

        if (!taxPeriodValue || !targetField) {
            if (targetField) targetField.value = "";
            return;
        }

        const now = new Date();
        let fy = now.getFullYear();

        const normalized = taxPeriodValue.replace(/[–—−]/g, "-");
        const parts = normalized.split(/\s*-\s*/);

        if (parts.length < 2) {
            targetField.value = "";
            return;
        }

        const startParsed = parseDayMonth(parts[0].trim());
        const endParsed = parseDayMonth(parts[1].trim());

        if (!startParsed || !endParsed) {
            targetField.value = "";
            return;
        }

        const startMonthNum = monthNameToNumber(startParsed.monthStr);
        const endMonthNum = monthNameToNumber(endParsed.monthStr);
        if (!startMonthNum || !endMonthNum) {
            targetField.value = "";
            return;
        }

        let startYear, endYear;
        if (endMonthNum < startMonthNum) {
            startYear = fy - 1;
            endYear = fy;
        } else {
            startYear = fy;
            endYear = fy;
        }

        const startDay = Array.isArray(startParsed.day)
            ? (isLeapYear(startYear) ? startParsed.day[1] : startParsed.day[0])
            : startParsed.day;

        const endDay = Array.isArray(endParsed.day)
            ? (isLeapYear(endYear) ? endParsed.day[1] : endParsed.day[0])
            : endParsed.day;

        const startFormatted = formatPrettyDate(startDay, startMonthNum, startYear);
        const endFormatted = formatPrettyDate(endDay, endMonthNum, endYear);

        targetField.value = `${startFormatted} - ${endFormatted}`;
    } catch (e) {
        console.error("updateTaxPeriodEnding error:", e);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const taxPeriodField = document.getElementById("tax-period-vat");

    if (taxPeriodField) {
        taxPeriodField.addEventListener("change", updateTaxPeriodEnding);
        taxPeriodField.addEventListener("input", updateTaxPeriodEnding);
    }
});

function parseDayMonth(text) {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const dayPart = parts[0].replace(/[.,]/g, "");
    const monthStr = parts.slice(1).join(" ").replace(/[.,]/g, "");
    if (dayPart.includes("/")) {
        const d = dayPart.split("/").map(s => parseInt(s, 10));
        if (d.some(isNaN)) return null;
        return { day: d, monthStr };
    } else {
        const dnum = parseInt(dayPart, 10);
        if (isNaN(dnum)) return null;
        return { day: dnum, monthStr };
    }
}

function monthNameToNumber(m) {
    if (!m) return null;
    try {
        const date = new Date(`${m} 1, 2000`);
        if (isNaN(date)) return null;
        return date.getMonth() + 1;
    } catch (e) {
        return null;
    }
}

function formatPrettyDate(day, monthNum, year) {
    const d = parseInt(day, 10);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[monthNum - 1]} ${d}, ${year}`;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// -----------------------------
// File caching & upload
// -----------------------------
async function cacheFileOnChange(event) {
    clearErrors();

    const fileInput = event.target;
    const file = fileInput?.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        showError(fileInput.id, "File size must not exceed 10MB.");
        return;
    }

    showUploadBuffer();

    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        if (fileInput.id === "vat-tax-return") {
            cachedFile = file;
            cachedBase64 = base64;
        } else if (fileInput.id === "payment-instruction") {
            cachedFilePayment = file;
            cachedBase64Payment = base64;
        }

        await new Promise((res) => setTimeout(res, 3000));
        hideUploadBuffer();
    } catch (err) {
        console.error("Error caching file:", err);
        hideUploadBuffer();
        showError("vat-tax-return", "Failed to read file.");
    }
}

async function uploadFileToCRM() {
    if (cachedFile && cachedBase64) {
        await ZOHO.CRM.API.attachFile({
            Entity: "Applications1",
            RecordID: app_id,
            File: { Name: cachedFile.name, Content: cachedBase64 },
        });
    }
    // Only upload payment instruction if it exists (i.e., if tax was paid)
    if (cachedFilePayment && cachedBase64Payment) {
        await ZOHO.CRM.API.attachFile({
            Entity: "Applications1",
            RecordID: app_id,
            File: { Name: cachedFilePayment.name, Content: cachedBase64Payment },
        });
    }
}

// -----------------------------
// Conditional visibility of payment fields
// -----------------------------
function checkTaxAndToggleVisibility() {
    const taxPaidField = document.getElementById("tax-paid");
    const paymentReferenceField = document.getElementById("payment-reference");
    const paymentRefLabel = document.getElementById("payment-ref-label");
    const paymentInstructionField = document.getElementById("payment-instruction");
    const paymentInstLabel = document.getElementById("payment-inst-label");
    const payGibanField = document.getElementById("pay-giban");
    const payGibanLabel = document.getElementById("pay-giban-label");

    // Convert the tax paid value to a number for comparison
    const taxPaidValue = parseFloat(taxPaidField.value) || 0;
    const isTaxPaid = taxPaidValue > 0;

    if (isTaxPaid) {
        // Show fields and make them required
        
        // Payment Reference
        paymentReferenceField.style.display = 'block';
        paymentReferenceField.required = true;
        paymentRefLabel.style.display = 'block';
        if (!paymentRefLabel.querySelector(".required-star")) {
            paymentRefLabel.innerHTML = 'Payment Reference <span class="required-star" style="color:red">*</span>';
        }

        // Payment Instruction (File Upload)
        paymentInstructionField.style.display = 'block';
        paymentInstructionField.required = true; // Required for form submission, handled in update_record
        paymentInstLabel.style.display = 'block';
        if (!paymentInstLabel.querySelector(".required-star")) {
            paymentInstLabel.innerHTML = 'Payment Instruction <span class="required-star" style="color:red">*</span>';
        }

        // Pay GIBAN
        payGibanField.style.display = 'block';
        payGibanField.required = true;
        payGibanLabel.style.display = 'block';
        if (!payGibanLabel.querySelector(".required-star")) {
            payGibanLabel.innerHTML = 'Pay (GIBAN) <span class="required-star" style="color:red">*</span>';
        }

    } else {
        // Hide fields, remove required status, and clear values/files
        
        // Payment Reference
        paymentReferenceField.style.display = 'none';
        paymentReferenceField.required = false;
        paymentRefLabel.style.display = 'none';
        paymentRefLabel.innerHTML = 'Payment Reference';
        if (paymentReferenceField.value) paymentReferenceField.value = '';

        // Payment Instruction
        paymentInstructionField.style.display = 'none';
        paymentInstructionField.required = false;
        paymentInstLabel.style.display = 'none';
        paymentInstLabel.innerHTML = 'Payment Instruction';
        if (paymentInstructionField.value) {
            paymentInstructionField.value = '';
            cachedFilePayment = null;
            cachedBase64Payment = null;
        }

        // Pay GIBAN
        payGibanField.style.display = 'none';
        payGibanField.required = false;
        payGibanLabel.style.display = 'none';
        payGibanLabel.innerHTML = 'Pay (GIBAN)';
        // Note: We don't clear payGibanField.value here since it's populated on PageLoad
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const taxPaid = document.getElementById("tax-paid");
    
    // Bind the visibility toggle to input changes on the Tax Paid field
    taxPaid.addEventListener("input", checkTaxAndToggleVisibility);

    // Initial check on load
    checkTaxAndToggleVisibility();
});

// -----------------------------
// Date & formatting
// -----------------------------
function addOneYearAnd28Days(date) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + 1);
    result.setDate(result.getDate() + 28);
    return result;
}

function addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

function formatDateYYYYMMDD(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        console.error("Invalid date passed to formatDateYYYYMMDD:", date);
        return "";
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// -----------------------------
// Update Records
// -----------------------------

async function update_record(event = null) {
    if (event) event.preventDefault();

    clearErrors();

    let hasError = false;
    const submitBtn = document.getElementById("submit_button_id");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
    }

    const referenceNo = document.getElementById("reference-number")?.value;
    const taxablePerson = document.getElementById("name-of-taxable-person")?.value;
    const taxRegNo = document.getElementById("tax-registration-number")?.value;
    const taxPeriodVat = document.getElementById("tax-period-vat")?.value;
    const taxPeriodEnding = document.getElementById("tax-period-ending")?.value;
    const appDate = document.getElementById("application-date")?.value;
    const taxPaid = document.getElementById("tax-paid")?.value;
    const paymentRef = document.getElementById("payment-reference")?.value;
    const payGibanRef = document.getElementById("pay-giban")?.value;

    // --- Validation Checks ---
    if (!referenceNo) { showError("reference-number", "Reference Number is required."); hasError = true;}
    if (!taxablePerson) { showError("name-of-taxable-person", "Legal Name of Taxable Person is required."); hasError = true;}
    if (!taxRegNo) { showError("tax-registration-number", "Tax Registration Number is required."); hasError = true;}
    if (!taxPeriodVat) { showError("tax-period-vat", "Tax Period VAT is required."); hasError = true;}
    if (!taxPeriodEnding) { showError("tax-period-ending", "Tax Period Ending is required."); hasError = true;}
    if (!appDate) { showError("application-date", "Application Date is required."); hasError = true;}
    if (!taxPaid) { showError("tax-paid", "Tax Paid is required."); hasError = true;}
    if (!cachedFile || !cachedBase64) { showError("vat-tax-return", "Please upload the VAT Tax Return."); hasError = true;}

    // Conditional Validation
    if (parseFloat(taxPaid) > 0) {
        if (!paymentRef) 
        { 
            showError("payment-reference", "Payment Reference is required."); 
            hasError = true;
        }
        if (!payGibanRef)
        {
            showError("pay-giban", "Pay (GIBAN) is required.");
            hasError = true;
        }
        // Check for cached file for payment instruction
        if (!cachedFilePayment || !cachedBase64Payment) 
        { showError("payment-instruction", "Please upload the Payment Instruction."); 
            hasError = true;
        }
    }

    if (hasError) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit";
        }
        return;
    }

    let qtrDueDates = {};
    let currentQuarterField = null;
    let vatReturnDueDate = null;

    try {
        const normalized = taxPeriodVat.replace(/[–—−]/g, "-");
        const parts = normalized.split(/\s*-\s*/);
        if (parts.length >= 2) {
            const startParsed = parseDayMonth(parts[0].trim());
            const endParsed = parseDayMonth(parts[1].trim());
            if (startParsed && endParsed) {
                const startMonthNum = monthNameToNumber(startParsed.monthStr);
                const endMonthNum = monthNameToNumber(endParsed.monthStr);
                if (startMonthNum && endMonthNum) {
                    const now = new Date();
                    const fy = now.getFullYear();

                    let startYear, endYear;
                    if (endMonthNum < startMonthNum) {
                        startYear = fy - 1;
                        endYear = fy;
                    } else {
                        startYear = fy;
                        endYear = fy;
                    }

                    const endDay = Array.isArray(endParsed.day)
                        ? (isLeapYear(endYear) ? endParsed.day[1] : endParsed.day[0])
                        : endParsed.day;

                    const endDate = new Date(endYear, endMonthNum - 1, endDay);

                    const qtrDueDate = addOneYearAnd28Days(endDate);

                    vatReturnDueDate = addMonths(qtrDueDate, 3);

                    const quarterMap = {
                        "1 Jan - 31 Mar": "st_Qtr_VAT_return_DD",
                        "1 Apr - 30 Jun": "nd_Qtr_VAT_return_DD",
                        "1 Jul - 30 Sep": "rd_Qtr_VAT_return_DD",
                        "1 Oct - 31 Dec": "th_Qtr_VAT_return_DD",
                        "1 Feb - 30 Apr": "st_Qtr_VAT_return_DD",
                        "1 May - 31 Jul": "nd_Qtr_VAT_return_DD",
                        "1 Aug - 31 Oct": "rd_Qtr_VAT_return_DD",
                        "1 Nov - 31 Jan": "th_Qtr_VAT_return_DD",
                        "1 Mar - 31 May": "st_Qtr_VAT_return_DD",
                        "1 Jun - 31 Aug": "nd_Qtr_VAT_return_DD",
                        "1 Sep - 30 Nov": "rd_Qtr_VAT_return_DD",
                        "1 Dec - 28/29 Feb": "th_Qtr_VAT_return_DD"
                    };

                    currentQuarterField = quarterMap[taxPeriodVat] || null;
                    if (currentQuarterField) {
                        qtrDueDates[currentQuarterField] = qtrDueDate;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error computing quarter dates:", e);
    }

    try {
        const apiData = {
            id: app_id,
            Reference_Number: referenceNo,
            Legal_Name_of_Taxable_Person: taxablePerson,
            Tax_Registration_Number_TRN: taxRegNo,
            Tax_Period_VAT_QTR: taxPeriodVat,
            Application_Date: appDate,
            Tax_Period_Ending: taxPeriodEnding,
            Application_Issuance_Date: appDate,
            Tax_Paid: taxPaid
        };
        
        // Only include payment fields if tax was paid
        if (parseFloat(taxPaid) > 0) {
            apiData.Payment_Reference = paymentRef;
            apiData.Pay_GIBAN = payGibanRef;
        }

        await ZOHO.CRM.API.updateRecord({
            Entity: "Applications1",
            APIData: apiData,
        });

        const updateData = {
            id: account_id,
            Legal_Name_of_Taxable_Person: taxablePerson,
            TRN_Number: taxRegNo,
            Tax_Period_VAT_QTR: taxPeriodVat,
            VAT_Status: "Active",
            VAT_Pay_GIBAN: payGibanRef // Updated to always save GIBAN back to Account
        };
        await ZOHO.CRM.API.updateRecord({
            Entity: "Accounts",
            APIData: updateData,
        });

        await uploadFileToCRM();
        await ZOHO.CRM.BLUEPRINT.proceed();
        await ZOHO.CRM.UI.Popup.closeReload();
    } catch (error) {
        console.error("Error on final submit:", error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit";
        }
    }
}

// -----------------------------
// Event bindings (keep original IDs)
// -----------------------------
const vatInput = document.getElementById("vat-tax-return");
if (vatInput) vatInput.addEventListener("change", cacheFileOnChange);

const paymentInf = document.getElementById("payment-instruction");
if(paymentInf) paymentInf.addEventListener("change", cacheFileOnChange)

const recForm = document.getElementById("record-form");
if (recForm) recForm.addEventListener("submit", update_record);

// Close widget helper
async function closeWidget() {
    await ZOHO.CRM.UI.Popup.closeReload().then(console.log);
}

ZOHO.embeddedApp.init();