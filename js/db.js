import { ref, onValue, set, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { db } from "./config.js";

// استماع للبيانات
export function listenToData(onData, onError) {
    const dbRef = ref(db, 'app_db_v2');
    onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        onData(val);
    }, onError);
}

// استماع لكلمات المرور
export function listenToPasswords(onData) {
    onValue(ref(db, 'app_settings/passwords'), (s) => {
        if (s.exists()) onData(s.val());
    });
}

// العمليات (CRUD)
export function addContract(data) {
    return push(ref(db, 'app_db_v2/contracts'), data);
}

export function updateContract(id, data) {
    return update(ref(db, `app_db_v2/contracts/${id}`), data);
}

export function deleteContract(id) {
    return remove(ref(db, `app_db_v2/contracts/${id}`));
}

export function addContractor(name) {
    return push(ref(db, 'app_db_v2/contractors'), { name });
}

export function updateContractor(id, name) {
    return update(ref(db, `app_db_v2/contractors/${id}`), { name });
}

export function deleteContractor(id) {
    return remove(ref(db, `app_db_v2/contractors/${id}`));
}

export function updateMonthStatus(contractId, monthIdx, data) {
    return update(ref(db, `app_db_v2/contracts/${contractId}/months/${monthIdx}`), data);
}

export function updateMonthsList(monthsArray) {
    return update(ref(db, 'app_db_v2'), { monthNames: monthsArray });
}

export function updateContractMonths(contractId, monthsArray) {
    return update(ref(db, `app_db_v2/contracts/${contractId}`), { months: monthsArray });
}

export function resetDatabase() {
    return set(ref(db, 'app_db_v2'), { monthNames: [], contractors: {}, contracts: {} });
}

export function savePasswords(passwords) {
    return set(ref(db, 'app_settings/passwords'), passwords);
}
