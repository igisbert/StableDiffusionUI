import { createIcons, icons } from "lucide";

let trigger;
let popover;
let listEl;
let isOpen = false;
let pendingItems = null;

function updateTriggerText() {
    if (!trigger) return;
    const rows = listEl ? Array.from(listEl.querySelectorAll('.lora-row')) : [];
    const checked = rows.filter(r => r.querySelector('input[type="checkbox"]')?.checked);
    if (checked.length === 0) {
        trigger.querySelector('.lora-trigger-label').textContent = 'Ninguno';
        trigger.dataset.empty = 'true';
    } else if (checked.length === 1) {
        const name = checked[0].dataset.lora || checked[0].querySelector('.lora-row-name')?.textContent || '';
        const short = name.replace(/\.[^.]+$/, '');
        trigger.querySelector('.lora-trigger-label').textContent = short;
        trigger.dataset.empty = 'false';
    } else {
        trigger.querySelector('.lora-trigger-label').textContent = `${checked.length} LoRAs`;
        trigger.dataset.empty = 'false';
    }
}

function close() {
    if (!popover || !trigger) return;
    isOpen = false;
    popover.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
}

function open() {
    if (!popover || !trigger) return;
    isOpen = true;
    popover.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
}

function toggle() {
    if (isOpen) close(); else open();
}

export function populateLoraList(items) {
    if (!listEl) {
        pendingItems = items;
        return;
    }
    listEl.innerHTML = '';
    if (!items || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'lora-empty';
        empty.textContent = 'No hay LoRAs';
        listEl.appendChild(empty);
        updateTriggerText();
        return;
    }
    for (const file of items) {
        const row = document.createElement('label');
        row.className = 'lora-row';
        row.dataset.lora = file;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = file;

        const iconOff = document.createElement('i');
        iconOff.dataset.lucide = 'square';
        iconOff.className = 'lora-check-icon off';
        iconOff.setAttribute('aria-hidden', 'true');

        const iconOn = document.createElement('i');
        iconOn.dataset.lucide = 'square-check-big';
        iconOn.className = 'lora-check-icon on';
        iconOn.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'lora-row-name';
        name.textContent = file;
        name.title = file;

        const weight = document.createElement('input');
        weight.type = 'number';
        weight.className = 'lora-row-weight';
        weight.min = '0';
        weight.max = '2';
        weight.step = '0.1';
        weight.value = '1';
        weight.disabled = true;

        const syncRow = () => {
            row.classList.toggle('checked', cb.checked);
            weight.disabled = !cb.checked;
            updateTriggerText();
            document.dispatchEvent(new CustomEvent('lora-change'));
        };

        cb.addEventListener('change', syncRow);

        // prevent row click from double-toggling when clicking weight input
        weight.addEventListener('click', (e) => e.stopPropagation());

        row.append(cb, iconOff, iconOn, name, weight);
        listEl.appendChild(row);
    }
    createIcons({ icons });
    updateTriggerText();
}

export function getLoras() {
    if (!listEl) return [];
    const rows = Array.from(listEl.querySelectorAll('.lora-row'));
    return rows.filter(r => r.querySelector('input[type="checkbox"]')?.checked).map(r => ({
        file: r.dataset.lora,
        weight: parseFloat(r.querySelector('.lora-row-weight')?.value) || 1
    }));
}

export function setLoras(loras) {
    if (!listEl) return;
    const map = new Map((loras || []).map(l => [l.file || l, l.weight ?? 1]));
    const rows = Array.from(listEl.querySelectorAll('.lora-row'));
    for (const row of rows) {
        const file = row.dataset.lora;
        const cb = row.querySelector('input[type="checkbox"]');
        const w = row.querySelector('.lora-row-weight');
        if (map.has(file)) {
            cb.checked = true;
            w.value = String(map.get(file));
            w.disabled = false;
        } else {
            cb.checked = false;
            w.value = '1';
            w.disabled = true;
        }
        row.classList.toggle('checked', cb.checked);
    }
    updateTriggerText();
}

export function initLoraMultiselect() {
    trigger = document.getElementById('btn-lora-trigger');
    popover = document.getElementById('popover-lora');
    listEl = document.getElementById('lora-list');
    if (!trigger || !popover || !listEl) return;

    if (pendingItems) {
        const items = pendingItems;
        pendingItems = null;
        populateLoraList(items);
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    document.addEventListener('click', (e) => {
        if (!isOpen) return;
        if (trigger.contains(e.target) || popover.contains(e.target)) return;
        close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) close();
    });

    // hide legacy single-select and single weight (keep label)
    const legacySelect = document.getElementById('select-lora');
    if (legacySelect) {
        legacySelect.style.display = 'none';
        const legacyWeight = document.getElementById('input-lora-weight');
        if (legacyWeight) {
            const legacyGroup = legacyWeight.closest('.input-group');
            if (legacyGroup) legacyGroup.style.display = 'none';
        }
    }
}
