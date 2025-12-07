import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAP-wgrP2o6ifi3XuaMK-lBB43nvrs3GfA",
    authDomain: "tabuk-kpi.firebaseapp.com",
    projectId: "tabuk-kpi",
    storageBucket: "tabuk-kpi.firebasestorage.app",
    messagingSenderId: "537604438384",
    appId: "1:537604438384:web:4391b219241c54f7d6f7b5",
    measurementId: "G-9FCG4452CQ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// تصدير المتغيرات لنستخدمها في الملفات الأخرى
export { db };
