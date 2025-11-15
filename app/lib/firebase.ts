// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
apiKey: "AIzaSyBSI-eoIdtSOo-oA3-N7zy3yqbGSw0m1H4",
authDomain: "techasdy-846d7.firebaseapp.com",
projectId: "techasdy-846d7",
storageBucket: "techasdy-846d7.firebasestorage.app",
messagingSenderId: "220151326032",
appId: "1:220151326032:web:5fd4bcbbff00267c59f855",
measurementId: "G-7RF3THQJ4F"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);