// Notification dispatch — per Technical Reference §11. No real email/SMS provider (out of
// scope); dispatches are logged and stored so the UI/API can show what "would have" been sent.

const { notifications } = require("./store");

function send({ channel, recipient, templateCode, referenceType, referenceNumber, payload }) {
  const entry = {
    id: notifications.length + 1,
    channel,
    recipient,
    templateCode,
    referenceType,
    referenceNumber,
    payload,
    sentAt: new Date().toISOString(),
  };
  notifications.push(entry);
  return entry;
}

function dispatchPolicyNotifications(policy) {
  const { policyHolder, digitalPolicyNumber, documents, icecash } = policy;

  send({
    channel: "EMAIL",
    recipient: policyHolder.email,
    templateCode: "MOTOR_POLICY_DOCUMENTS",
    referenceType: "POLICY",
    referenceNumber: digitalPolicyNumber,
    payload: {
      customerName: policyHolder.name,
      digitalPolicyNumber,
      coverNoteUrl: documents.coverNote,
      scheduleUrl: documents.schedule,
      receiptUrl: documents.receipt,
      licenceReceiptId: icecash.licenceReceiptId,
    },
  });

  send({
    channel: "SMS",
    recipient: policyHolder.msisdn,
    templateCode: "MOTOR_POLICY_LINK",
    referenceType: "POLICY",
    referenceNumber: digitalPolicyNumber,
    payload: {
      customerName: policyHolder.name,
      digitalPolicyNumber,
      coverNoteUrl: documents.coverNote,
      licenceReceiptId: icecash.licenceReceiptId,
    },
  });
}

module.exports = { send, dispatchPolicyNotifications };
