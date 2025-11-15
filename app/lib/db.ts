// lib/db.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type CustomerDetails = {
    fullName: string;
    email: string;
    phone: string;
    projectDescription: string;
};

export type LeadPayload = {
    calculatorType: "fabrication" | "fabDesign";
    inputs: Record<string, any>; // raw input fields as strings/numbers
    summary: Record<string, number | string>; // computed values you want to persist
    customer: CustomerDetails;
    createdAt?: any; // serverTimestamp()
};

export async function saveLead(data: LeadPayload) {
    return await addDoc(collection(db, "pcb_leads"), {
        ...data,
        createdAt: serverTimestamp(),
    });
}