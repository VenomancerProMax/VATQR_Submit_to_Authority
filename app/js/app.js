let app_id, account_id;
let cachedFile = null;
let cachedBase64 = null;
let cachedFilePayment = null;
let cachedBase64Payment = null;
let legalNameTaxablePerson, vat_pay_giban_account, ctTrn, taxPeriodVat;
let financialYearEndingDate = null;

function showModal(type, title, message) {
  const modal = document.getElementById("custom-modal");
  const iconSuccess = document.getElementById("modal-icon-success");
  const iconError = document.getElementById("modal-icon-error");
  const modalBtn = document.getElementById("modal-close");
  
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  
  modalBtn.onclick = closeModal;

  if (type === "success") { 
    iconSuccess.classList.remove("hidden"); 
    iconError.classList.add("hidden");
    
    modalBtn.onclick = async () => {
      modalBtn.disabled = true;
      modalBtn.textContent = "Finalizing...";
      
      try {
        // 1. Trigger the Blueprint transition
        await ZOHO.CRM.BLUEPRINT.proceed();
        
        // 2. Longer delay (1 second) to ensure the backend process is done
        setTimeout(() => {
          // 3. Force the TOP window (the actual CRM) to reload its current URL
          // This is the most "nuclear" reload option available in JS
          try {
            top.location.assign(top.location.href);
          } catch (e) {
            // Fallback if assign is blocked
            top.location.href = top.location.href;
          }
        }, 1000);

      } catch (e) {
        console.error("Blueprint error", e);
        // If it fails, still try to close the popup
        ZOHO.CRM.UI.Popup.closeReload().catch(() => {
           top.location.reload(true);
        });
      }
    };
  } else { 
    iconSuccess.classList.add("hidden"); 
    iconError.classList.remove("hidden"); 
  }
  
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal() {
  const modal = document.getElementById("custom-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function clearErrors() {
  document.querySelectorAll(".error-message").forEach(span => span.textContent = "");
}

function showError(fieldId, message) {
  const errorSpan = document.getElementById(`error-${fieldId}`);
  if (errorSpan) errorSpan.textContent = message;
}

function showUploadBuffer(msg = "Processing...") {
  const buffer = document.getElementById("upload-buffer");
  document.getElementById("upload-title").textContent = msg;
  buffer.classList.remove("hidden");
}

function hideUploadBuffer() {
  document.getElementById("upload-buffer").classList.add("hidden");
}

ZOHO.embeddedApp.on("PageLoad", async (entity) => {
  try {
    const appResp = await ZOHO.CRM.API.getRecord({ Entity: "Applications1", RecordID: entity.EntityId });
    const appData = appResp.data[0];
    app_id = appData.id;
    account_id = appData.Account_Name?.id || "";
    
    const fyEnding = appData.Financial_Year_Ending;
    let year = parseInt(fyEnding, 10);
    financialYearEndingDate = (!isNaN(year) && year > 1900) ? new Date(year, 0, 1) : new Date();
    
    const accResp = await ZOHO.CRM.API.getRecord({ Entity: "Accounts", RecordID: account_id });
    const accData = accResp.data[0];
    
    legalNameTaxablePerson = accData.Legal_Name_of_Taxable_Person;
    vat_pay_giban_account = accData.VAT_Pay_GIBAN;
    ctTrn = accData.TRN_Number;
    taxPeriodVat = accData.Tax_Period_VAT_QTR;
    
    document.getElementById("name-of-taxable-person").value = legalNameTaxablePerson || "";
    document.getElementById("tax-registration-number").value = ctTrn || "";
    document.getElementById("tax-period-vat").value = taxPeriodVat || "";
    document.getElementById("pay-giban").value = vat_pay_giban_account || "";
    
    updateTaxPeriodEnding();
    checkTaxAndToggleVisibility();
  } catch (err) { console.error(err); }
});

function updateTaxPeriodEnding() {
  const val = document.getElementById("tax-period-vat")?.value;
  const target = document.getElementById("tax-period-ending");
  if (!val || !target) return;
  
  const refDate = financialYearEndingDate || new Date();
  let fy = refDate.getFullYear();
  const normalized = val.replace(/[–—−]/g, "-");
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length < 2) return;
  
  const startP = parseDayMonth(parts[0]);
  const endP = parseDayMonth(parts[1]);
  if (!startP || !endP) return;
  
  const sM = monthNameToNumber(startP.monthStr);
  const eM = monthNameToNumber(endP.monthStr);
  
  let sY = (eM < sM) ? fy - 1 : fy;
  let eY = fy;
  
  const sD = Array.isArray(startP.day) ? (isLeapYear(sY) ? startP.day[1] : startP.day[0]) : startP.day;
  const eD = Array.isArray(endP.day) ? (isLeapYear(eY) ? endP.day[1] : endP.day[0]) : endP.day;
  
  target.value = `${formatPrettyDate(sD, sM, sY)} - ${formatPrettyDate(eD, eM, eY)}`;
}

function parseDayMonth(t) {
  const p = t.trim().split(/\s+/);
  if (p.length < 2) return null;
  const dPart = p[0].replace(/[.,]/g, "");
  const mStr = p.slice(1).join(" ").replace(/[.,]/g, "");
  if (dPart.includes("/")) {
    const d = dPart.split("/").map(s => parseInt(s, 10));
    return { day: d, monthStr: mStr };
  }
  return { day: parseInt(dPart, 10), monthStr: mStr };
}

function monthNameToNumber(m) {
  const d = new Date(`${m} 1, 2000`);
  return isNaN(d) ? null : d.getMonth() + 1;
}

function formatPrettyDate(d, m, y) {
  const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${mNames[m - 1]} ${d}, ${y}`;
}

function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

async function handleFile(file, type) {
  clearErrors();
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showModal("error", "File Too Large", "Max size is 10MB.");
    return;
  }
  document.getElementById(`file-name-${type}`).textContent = `File: ${file.name}`;
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (type === 'vat') { cachedFile = file; cachedBase64 = base64; }
  else { cachedFilePayment = file; cachedBase64Payment = base64; }
}

function setupDropZone(zoneId, inputId, type) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      handleFile(e.dataTransfer.files[0], type);
    }
  });
  input.addEventListener("change", (e) => handleFile(e.target.files[0], type));
}

function checkTaxAndToggleVisibility() {
  const val = parseFloat(document.getElementById("tax-paid").value) || 0;
  const isPaid = val > 0;
  document.getElementById("payment-section").style.display = isPaid ? "block" : "none";
}

async function update_record(event) {
  event.preventDefault();
  clearErrors();
  let hasError = false;
  const fields = ["reference-number", "name-of-taxable-person", "tax-registration-number", "tax-period-vat", "tax-period-ending", "application-date", "tax-paid"];
  
  fields.forEach(f => { if (!document.getElementById(f).value.trim()) { showError(f, "Required"); hasError = true; } });
  
  if (!cachedFile) { showError("vat-tax-return", "Upload required"); hasError = true; }
  
  const taxVal = parseFloat(document.getElementById("tax-paid").value) || 0;
  if (taxVal > 0) {
    if (!document.getElementById("payment-reference").value.trim()) { showError("payment-reference", "Required"); hasError = true; }
    if (!document.getElementById("pay-giban").value.trim()) { showError("pay-giban", "Required"); hasError = true; }
    if (!cachedFilePayment) { showError("payment-instruction", "Upload required"); hasError = true; }
  }
  
  if (hasError) return;
  
  const btn = document.getElementById("submit_button_id");
  btn.disabled = true;
  btn.textContent = "Updating...";
  showUploadBuffer("Submitting...");
  
  try {
    const apiData = {
      id: app_id,
      Reference_Number: document.getElementById("reference-number").value,
      Legal_Name_of_Taxable_Person: document.getElementById("name-of-taxable-person").value,
      Tax_Registration_Number_TRN: document.getElementById("tax-registration-number").value,
      Tax_Period_VAT_QTR: document.getElementById("tax-period-vat").value,
      Application_Date: document.getElementById("application-date").value,
      Tax_Period_Ending: document.getElementById("tax-period-ending").value,
      Tax_Paid: taxVal
    };
    
    if (taxVal > 0) {
      apiData.Payment_Reference = document.getElementById("payment-reference").value;
      apiData.Pay_GIBAN = document.getElementById("pay-giban").value;
    }
    
    await ZOHO.CRM.API.updateRecord({ Entity: "Applications1", APIData: apiData });
    
    await ZOHO.CRM.FUNCTIONS.execute("ta_vatqr_submit_to_auth_update_account", {
      arguments: JSON.stringify({
        account_id,
        legal_taxable_person: apiData.Legal_Name_of_Taxable_Person,
        trn_number: apiData.Tax_Registration_Number_TRN,
        tax_period_vat_qtr: apiData.Tax_Period_VAT_QTR,
        vat_pay_giban: apiData.Pay_GIBAN || ""
      })
    });
    
    await ZOHO.CRM.API.attachFile({ Entity: "Applications1", RecordID: app_id, File: { Name: cachedFile.name, Content: cachedBase64 } });
    
    if (cachedFilePayment) {
      await ZOHO.CRM.API.attachFile({ Entity: "Applications1", RecordID: app_id, File: { Name: cachedFilePayment.name, Content: cachedBase64Payment } });
    }
    
    hideUploadBuffer();
    showModal("success", "Success!", "Application processed. Click Ok to reload.");
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Submit";
    hideUploadBuffer();
    showModal("error", "Failed", "Submission failed. Please try again.");
  }
}

document.getElementById("tax-paid").addEventListener("input", checkTaxAndToggleVisibility);
document.getElementById("tax-period-vat").addEventListener("change", updateTaxPeriodEnding);
document.getElementById("record-form").addEventListener("submit", update_record);
setupDropZone("drop-zone-vat", "vat-tax-return", "vat");
setupDropZone("drop-zone-pay", "payment-instruction", "pay");

async function closeWidget() { await ZOHO.CRM.UI.Popup.closeReload(); }
ZOHO.embeddedApp.init();