let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;

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
    ctTrn = accountData.Corporate_Tax_TRN;
    taxPeriodVat = accountData.Tax_Period_VAT;

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

/* -------------------------
   Tax Period Ending logic
   ------------------------- */

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

    const q1SegmentMatch = taxPeriodValue.match(/Q1:\s*([^,]+?)(?:,|$|Q2:)/i);
    if (!q1SegmentMatch) {
      console.warn("Q1 segment not found. Value:", taxPeriodValue);
      targetField.value = "";
      return;
    }

  const q1Segment = q1SegmentMatch[1].trim();
  const normalized = q1Segment.replace(/[–—−]/g, "-");
  const parts = normalized.split(/\s*-\s*/);

  if (parts.length < 2) {
    console.warn("Q1 range did not split into two parts:", normalized);
    targetField.value = "";
    return;
  }

    const startPart = parts[0].trim();
    const endPartRaw = parts[1].trim();

    // Parse start (day + month)
    const startParsed = parseDayMonth(startPart);
    if (!startParsed) {
      console.warn("Failed to parse startPart:", startPart);
      targetField.value = "";
      return;
    }

    const endParsed = parseDayMonth(endPartRaw);
    if (!endParsed) {
      console.warn("Failed to parse endPart:", endPartRaw);
      targetField.value = "";
      return;
    }

    const startMonthNum = monthNameToNumber(startParsed.monthStr);
    const endMonthNum = monthNameToNumber(endParsed.monthStr);
    if (!startMonthNum || !endMonthNum) {
      console.warn("Month number conversion failed:", startParsed, endParsed);
      targetField.value = "";
      return;
    }

    let startYear, endYear;
    if (endMonthNum < startMonthNum) {
      // crosses year boundary (e.g., Dec -> Feb)
      startYear = fy - 1;
      endYear = fy;
    } else {
      startYear = fy;
      endYear = fy;
    }

    // Choose correct end day when given "28/29"
    const endDay = Array.isArray(endParsed.day) ? (isLeapYear(endYear) ? endParsed.day[1] : endParsed.day[0]) : endParsed.day;
    const startDay = Array.isArray(startParsed.day) ? startParsed.day[0] : startParsed.day; // start rarely has /, but handle if present

    const startFormatted = formatPrettyDate(startDay, startMonthNum, startYear);
    const endFormatted = formatPrettyDate(endDay, endMonthNum, endYear);

    console.log("updateTaxPeriodEnding -> start:", startPart, "->", startFormatted, "end:", endPartRaw, "->", endFormatted);

    targetField.value = `${startFormatted} - ${endFormatted}`;
  } catch (e) {
    console.error("updateTaxPeriodEnding error:", e);
  }
}

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
  // Normalize e.g., "Jan", "January" -> works
  try {
    const date = new Date(`${m} 1, 2000`);
    if (isNaN(date)) return null;
    return date.getMonth() + 1; // 1..12
  } catch (e) {
    return null;
  }
}

function formatPrettyDate(day, monthNum, year) {
  // day may be number or NaN; monthNum 1..12
  const d = parseInt(day, 10);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[monthNum - 1]} ${d}, ${year}`;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/* -------------------------
   End Tax Period logic
   ------------------------- */

// Validation + live calculation on Financial Year change
const fyInput = document.getElementById("financial-year");
if (fyInput) {
  fyInput.addEventListener("input", () => {
    fyInput.value = fyInput.value.replace(/\D/g, "").slice(0, 4);
    const err = validateFinancialYear(fyInput.value);
    if (!err) {
      const span = document.getElementById("error-financial-year");
      if (span) span.textContent = "";
    }
  });
  fyInput.addEventListener("blur", () => {
    const val = fyInput.value;
    if (/^\d{4}$/.test(val)) {
      let year = parseInt(val, 10);
      if (year < 2025) year = 2025;
      if (year > 2050) year = 2050;
      fyInput.value = String(year);
    }
    updateTaxPeriodEnding();
  });
}

// Recalculate when Tax Period VAT changes
const taxPeriodVatSelect = document.getElementById("tax-period-vat");
if (taxPeriodVatSelect) {
  taxPeriodVatSelect.addEventListener("change", updateTaxPeriodEnding);
}

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

function addOneYearAndSet28(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date)) return "";
    date.setFullYear(date.getFullYear() + 1);
    date.setDate(date.getDate() + 28);
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
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

  // --- Calculate QTR VAT return due dates ---
  const qtrDueDates = {};
  if (taxPeriodEnding) {
    // Try to get the Q1 start date from Tax Period VAT
    const q1Match = taxPeriodVat.match(/Q1:\s*([^,]+?)(?:,|$|Q2:)/i);
    if (q1Match) {
      const q1StartRaw = q1Match[1].trim().split(/\s*-\s*/)[0];
      const parsedQ1 = parseDayMonth(q1StartRaw);
      const monthNum = monthNameToNumber(parsedQ1.monthStr);
      if (monthNum) {
        const fy = parseInt(financialYear, 10);
        const startDate = new Date(fy, monthNum - 1, Array.isArray(parsedQ1.day) ? parsedQ1.day[0] : parsedQ1.day);

        // Quarter intervals
        const qtrDates = [0, 3, 6, 9].map(m => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + m);
          return addOneYearAndSet28(d);
        });

        qtrDueDates.st_Qtr_VAT_return_DD = qtrDates[0];
        qtrDueDates.nd_Qtr_VAT_return_DD = qtrDates[1];
        qtrDueDates.rd_Qtr_VAT_return_DD = qtrDates[2];
        qtrDueDates.th_Qtr_VAT_return_DD = qtrDates[3];
      }
    }
  }

  try {
    await ZOHO.CRM.API.updateRecord({
      Entity: "Applications1",
      APIData: {
        id: app_id,
        Reference_Number: referenceNo,
        Legal_Name_of_Taxable_Person: taxablePerson,
        Tax_Registration_Number_TRN: taxRegNo,
        Tax_Period_VAT: taxPeriodVat,
        Financial_Year_Ending: financialYear,
        Tax_Period_Ending: taxPeriodEnding,
        Application_Date: appDate,
        Application_Issuance_Date: appDate,
        Tax_Paid: taxPaid,
      },
    });

    await ZOHO.CRM.API.updateRecord({
      Entity: "Accounts",
      APIData: {
        id: account_id,
        Legal_Name_of_Taxable_Person: taxablePerson,
        TRN_Number: taxRegNo,
        Tax_Period_VAT: taxPeriodVat,
        VAT_Status: "Active",
        st_Qtr_VAT_return_DD: qtrDueDates.st_Qtr_VAT_return_DD || "",
        nd_Qtr_VAT_return_DD: qtrDueDates.nd_Qtr_VAT_return_DD || "",
        rd_Qtr_VAT_return_DD: qtrDueDates.rd_Qtr_VAT_return_DD || "",
        th_Qtr_VAT_return_DD: qtrDueDates.th_Qtr_VAT_return_DD || ""

      },
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

document.getElementById("vat-tax-return").addEventListener("change", cacheFileOnChange);
document.getElementById("record-form").addEventListener("submit", update_record);

async function closeWidget() {
  await ZOHO.CRM.UI.Popup.closeReload().then(console.log);
}

ZOHO.embeddedApp.init();
