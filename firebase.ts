import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCpP7gIV4LZtTVlSoaBNBONAGyvsqxZy_g",
    authDomain: "our-bible-f3663.firebaseapp.com",
    projectId: "our-bible-f3663",
    storageBucket: "our-bible-f3663.firebasestorage.app",
    messagingSenderId: "812529233957",
    appId: "1:812529233957:web:a93b9d93a9bb56b9c88fcc",
    measurementId: "G-E9JWYCGCG4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.log('Persistence not supported by browser');
        }
    });
} catch (e) {
    console.log("Persistence initialization error", e);
}
