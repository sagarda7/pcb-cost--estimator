import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";

export type CustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
  projectDescription: string;
};

export type LeadPayload = {
  calculatorType: "fabrication" | "fabDesign";
  inputs: Record<string, any>;
  summary: Record<string, number | string>;
  customer: CustomerDetails;
  createdAt?: any;
};

export async function saveLead(data: LeadPayload) {
  const leadsRef = collection(db, "pcb_leads");

  // 🔍 Check if a lead with same email exists
  const q = query(leadsRef, where("customer.email", "==", data.customer.email));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    // ✏️ Update first matching document
    const existingDoc = snapshot.docs[0];
    await updateDoc(doc(db, "pcb_leads", existingDoc.id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    console.log("✅ Updated existing lead:", existingDoc.id);
    return existingDoc.id;
  } else {
    // ➕ Add new doc if no match
    const newDoc = await addDoc(leadsRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    console.log("🆕 Created new lead:", newDoc.id);
    return newDoc.id;
  }
}
