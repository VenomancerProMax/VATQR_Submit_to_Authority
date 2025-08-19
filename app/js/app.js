// -----------------------------
// Global state / varialbles
// -----------------------------
let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;

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
    ctTrn = accountData.TRN_Number;
    taxPeriodVat = accountData.Tax_Period_VAT_QTR;

    var now = new Date();
    var currentYear = now.getFullYear();

    document.getElementById("name-of-taxable-person").value = legalNameTaxablePerson || "";
    document.getElementById("tax-registration-number").value = ctTrn || "";
    document.getElementById("tax-period-vat").value = taxPeriodVat || "";
    document.getElementById("financial-year").value = currentYear || "";

    updateTaxPeriodEnding();

    ZOHO.CRM.UI.Resize({ height: "90%" }).then(function (data) {
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

function validateFinancialYear(fy) {
  if (!/^\d{4}$/.test(fy)) {
    return "Enter a four-digit year (e.g., 2025).";
  }
  const year = parseInt(fy, 10);
  if (year < 2025 || year > 2050) {
    return "Year must be between 2025 and 2050.";
  }
  return "";
}

// -----------------------------
// Tax period display logic
// -----------------------------
function updateTaxPeriodEnding() {
  try {
    const fyRaw = document.getElementById("financial-year")?.value;
    const taxPeriodValue = document.getElementById("tax-period-vat")?.value;
    const targetField = document.getElementById("tax-period-ending");

    if (!fyRaw || !taxPeriodValue || !targetField) {
      if (targetField) targetField.value = "";
      return;
    }

    const fy = parseInt(fyRaw, 10);
    if (isNaN(fy)) {
      targetField.value = "";
      return;
    }

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
      startYear = fy - 1; // e.g., start = Dec (previous year)
      endYear = fy;
    } else {
      startYear = fy;
      endYear = fy;
    }

    const startDay = Array.isArray(startParsed.day) ? startParsed.day[0] : startParsed.day;
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
  const fyField = document.getElementById("financial-year");
  const taxPeriodField = document.getElementById("tax-period-vat");

  if (fyField) {
    fyField.addEventListener("change", updateTaxPeriodEnding);
    fyField.addEventListener("input", updateTaxPeriodEnding);
  }

  if (taxPeriodField) {
    taxPeriodField.addEventListener("change", updateTaxPeriodEnding);
    taxPeriodField.addEventListener("input", updateTaxPeriodEnding);
  }
});

function parseDayMonth(text) {
  // Accepts: "1 Dec", "28/29 Feb", "31 Mar"
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const dayPart = parts[0].replace(/[.,]/g, "");
  const monthStr = parts.slice(1).join(" ").replace(/[.,]/g, "");
  if (dayPart.includes("/")) {
    // return array [nonLeap, leap]
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
    return date.getMonth() + 1; // 1..12
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

  if (file.size > 20 * 1024 * 1024) {
    showError("vat-tax-return", "File size must not exceed 20MB.");
    return;
  }

  showUploadBuffer();

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    let base64Content = base64;
    if (typeof base64 === "string" && base64.indexOf(",") !== -1) {
      base64Content = base64.split(",")[1];
    }

    cachedFile = file;
    cachedBase64 = base64Content;

    // small UX pause to show progress bar
    await new Promise((res) => setTimeout(res, 3000));
    hideUploadBuffer();
  } catch (err) {
    console.error("Error caching file:", err);
    hideUploadBuffer();
    showError("vat-tax-return", "Failed to read file.");
  }
}

async function uploadFileToCRM() {
  if (!cachedFile || !cachedBase64) {
    throw new Error("No cached file");
  }

  return await ZOHO.CRM.API.attachFile({
    Entity: "Applications1",
    RecordID: app_id,
    File: {
      Name: cachedFile.name,
      Content: cachedBase64,
    },
  });
}

// -----------------------------
// Date & formatting
// -----------------------------
function addOneYearAnd28Days(date) {
  // Accepts a Date object
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

function complete_trigger() {
  ZOHO.CRM.BLUEPRINT.proceed();
}

async function update_record(event = null) {
  if (event) event.preventDefault();

  clearErrors();

  let hasError = false;
  const submitBtn = document.getElementById("submit_button_id");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  // collect fields (use same IDs as your form)
  const referenceNo = document.getElementById("reference-number")?.value;
  const taxablePerson = document.getElementById("name-of-taxable-person")?.value;
  const taxRegNo = document.getElementById("tax-registration-number")?.value;
  const taxPeriodVat = document.getElementById("tax-period-vat")?.value;
  const financialYear = document.getElementById("financial-year")?.value;
  const taxPeriodEnding = document.getElementById("tax-period-ending")?.value;
  const appDate = document.getElementById("application-date")?.value;
  const taxPaid = document.getElementById("tax-paid")?.value;

  if (!referenceNo) { showError("reference-number", "Reference Number is required."); hasError = true;}
  if (!taxablePerson) { showError("name-of-taxable-person", "Legal Name of Taxable Person is required."); hasError = true;}
  if (!taxRegNo) { showError("tax-registration-number", "Tax Registration Number is required."); hasError = true;}
  if (!taxPeriodVat) { showError("tax-period-vat", "Tax Period VAT is required."); hasError = true;}
  if (!financialYear) { showError("financial-year", "Financial Year is required."); hasError = true;}
  if (!taxPeriodEnding) { showError("tax-period-ending", "Tax Period Ending is required."); hasError = true;}
  if (!appDate) { showError("application-date", "Application Date is required."); hasError = true;}
  if (!taxPaid) { showError("tax-paid", "Tax Paid is required."); hasError = true;}
  if (!cachedFile || !cachedBase64) { showError("vat-tax-return", "Please upload the VAT Tax Return."); hasError = true;}

  if (hasError) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
    return;
  }

  // -----------------------------
  // Calculate quarter due date and VAT_Return_Due_Date
  // -----------------------------
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
          const fy = parseInt(financialYear, 10);
          let startYear, endYear;
          if (endMonthNum < startMonthNum) {
            // crosses year boundary, e.g., Dec -> Feb
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

          // quarter due date = endDate + 1 year + 28 days
          const qtrDueDate = addOneYearAnd28Days(endDate);

          // VAT_Return_Due_Date = qtrDueDate + 3 months
          vatReturnDueDate = addMonths(qtrDueDate, 3);

          // Map dropdown selection to the CRM quarter field
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
            qtrDueDates[currentQuarterField] = qtrDueDate; // store Date object
          }
        }
      }
    }
  } catch (e) {
    console.error("Error computing quarter dates:", e);
  }

  // -----------------------------
  // Update Applications1 record first
  // -----------------------------
  try {
    await ZOHO.CRM.API.updateRecord({
      Entity: "Applications1",
      APIData: {
        id: app_id,
        Reference_Number: referenceNo,
        Legal_Name_of_Taxable_Person: taxablePerson,
        Tax_Registration_Number_TRN: taxRegNo,
        Tax_Period_VAT_QTR: taxPeriodVat,
        Financial_Year_Ending: financialYear,
        Tax_Period_Ending: taxPeriodEnding,
        Application_Date: appDate,
        Application_Issuance_Date: appDate,
        Tax_Paid: taxPaid,
      },
    });

    // -----------------------------
    // Build Accounts payload — only include current quarter and VAT_Return_Due_Date
    // -----------------------------
    const updateData = {
      id: account_id,
      Legal_Name_of_Taxable_Person: taxablePerson,
      TRN_Number: taxRegNo,
      Tax_Period_VAT_QTR: taxPeriodVat,
      VAT_Status: "Active",
      Tax_Period_Ending: taxPeriodEnding,
    };

    // if (currentQuarterField && qtrDueDates[currentQuarterField]) {
    //   updateData[currentQuarterField] = formatDateYYYYMMDD(qtrDueDates[currentQuarterField]);
    // }
    // if (vatReturnDueDate) {
    //   updateData.VAT_Return_Due_Date = formatDateYYYYMMDD(vatReturnDueDate);
    // }

    await ZOHO.CRM.API.updateRecord({
      Entity: "Accounts",
      APIData: updateData,
    });

    // -----------------------------
    // attach file, proceed blueprint, close popup
    // -----------------------------
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

const recForm = document.getElementById("record-form");
if (recForm) recForm.addEventListener("submit", update_record);

// Close widget helper
async function closeWidget() {
  await ZOHO.CRM.UI.Popup.closeReload().then(console.log);
}
ZOHO.embeddedApp.init();