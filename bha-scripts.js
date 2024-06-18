/* Copyright 2024 William Baker

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

// To-do: 

// keyboard navigation
// journal entries correctly displaying chronological by date, but incorrectly reversing the order of entries on each date
// change doIf_StillSynced and batchUpdateValues functions to promise-based rather than callback
// in journal, button to view/edit rcrg template from rcrg instance?
// for performance, don't populate entry options until it's editable. Only populate the selected option when creating, and then again if cancelEdit is called. Need to revise the 'getElementsByClassName('entry')' when updating accounts

/* allow columns outside those
called by bha_sync to have persistent data.
Meaning, don't insert and delete rows.
Therefore, I'd have to remove a row 
from the global journal, accts, or rcrgs array 
and rewrite the entire contents starting with 
the inserted row, or next row after deleted. 
That might be ok for accts and rcrgs but not journal. 
In any case, have a new journal populate a notice 
in Journal!F1, Account List!E1, and 
Recurring Entries!H1 notifying user of data 
persistency in that and following columns. 
-- add notice to all templates:
---- Journal: USER NOTICE: Do not change any data in Columns A through E. q͜ʘ does not access data in columns F and following. Rows may be inserted and deleted. Do not keep any information in columns F and following. 
---- Account List: USER NOTICE: Do not change any data in Columns A through D. q͜ʘ does not access data in columns E and following, and does not alter any data in those columns.
---- journal: USER NOTICE: Do not change any data in Columns A through G. q͜ʘ does not access data in columns H and following, and does not alter any data in those columns.
-- change edit accts and rcrgs functions (editAcctSaveNewAcct, editAcctDeleteAcct, saveRcrg, deleteRcrg) to edit the global arrays then rewrite spreadsheet contents without insertrows or deleterows. First write the journal entry delete function before changing rcrg's stable function
*/
// Google calendar integration for recurring entries. Or can I just send an email and have gmail interpret it correctly?
// social integration: create and share templates
/* for link from calendar: how to embed user data safely?
*/
// accessibility
// localization
/*
In ledgers:
--- some visual indication for sub-accounts
--- On an A/L/Q ledger, topline should show final balance next to the delta between debits and credits. Which requires the ajax call to go to BoY then a second filtering by selected date. Also handle multiple years. 
--- On A/L/Q ledger, how to show the running balance.
--- add annual closing and opening entries for A/L/Q accounts to December EOM review
*/
/*
multi-journal operations. For example, my home budget and sole proprietorship are separate journals. Have an owner draw in the business show up as income in the home budget.
*/
/*
check writing function: export docx files using jszip. Or generate a pdf?
in Edit Accounts, add typecode "C": "writes checks" for cash accounts
in Add Entry, show option to create check if a C account is selected to credit
popunder: check no., payee, amt(#), amt(written), memo. Have character limits.
*/

let today = new Date();

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const mos = ["Jan.","Feb.","March","April","May","June","July","Aug.","Sep.","Oct.","Nov.","Dec."];

const acct_type_key = {
    E: 'Expenses',
    R: 'Income',
    Q: 'Equity accounts',
    A: 'Assets',
    L: 'Liabilities',
    P: 'Payment accounts',
    B: 'Budgeted accounts',
    D: 'Discretionary budget',
    S: 'Set budget',
};

let ssid = localStorage.getItem('spreadsheetID');
let prevSSIDs = localStorage.getItem('prevSSIDs') ? JSON.parse(localStorage.getItem('prevSSIDs')) : {};
let ssprops;
if (localStorage.getItem('spreadsheet_properties')) ssprops = JSON.parse(localStorage.getItem('spreadsheet_properties'));

let accts = localStorage.getItem('account_list') ? JSON.parse(localStorage.getItem('account_list')) : [];

//let journal; 
//let tokenExpirationInMS;
// FOR DEVELOPMENT ONLY:
let journal = localStorage.getItem('journal') ? JSON.parse(localStorage.getItem('journal')) : []; // this might get too big

let tokenExpirationInMS = localStorage.getItem('gapiTokenExp') ? parseInt(localStorage.getItem('gapiTokenExp')) : 0; // this might break their rules. Can i keep the hourlong token in localStorage? If not, can I do it if I add a "keep my signed in" option that is unchecked by default?

function checkLocalStorageSize() { // to test how big the journal gets
    let _lsTotal = 0;
    for (const _x in localStorage) {
        if (!localStorage.hasOwnProperty(_x)) {
            continue;
        }
        const _xLen = ((localStorage[_x].length + _x.length) * 2);
        _lsTotal += _xLen;
        console.log(_x.substring(0, 50) + " = " + (_xLen / 1024).toFixed(2) + " KB")
    }
    console.log("Total = " + (_lsTotal / 1024).toFixed(2) + " KB");
} 

// END FOR DEVELOPMENT ONLY

let rcrgs = localStorage.getItem('rcrgs') ? JSON.parse(localStorage.getItem('rcrgs')) : [];

let eom_ledger;

function flash(message, callback, cancel_callback) {
    // alert(message);
    let flashContent;
    if (typeof message == 'string') {
        flashContent = mk('span');
        flashContent.textContent = message;
    } else flashContent = message;
    if (!callback) {
        while (document.getElementById('flash_msg').firstChild) document.getElementById('flash_msg').firstChild.remove();
        document.getElementById('flash_msg').append(flashContent);
        document.getElementById('flash_msg_box').style.display = 'flex';
    } else {
        while (document.getElementById('flash_conf').firstChild) document.getElementById('flash_conf').firstChild.remove();
        document.getElementById('flash_conf').append(flashContent);
        function resetFlashConfBtns() {
            while (document.getElementById('flash_conf').firstChild) document.getElementById('flash_conf').firstChild.remove();
            document.getElementById('flash_conf_yes').onclick = '';
            document.getElementById('flash_conf_no').onclick = () => {
                document.getElementById('flash_conf_box').style.display = 'none';
                document.getElementById('flash_conf_yes').onclick = '';
                while (document.getElementById('flash_conf').firstChild) document.getElementById('flash_conf').firstChild.remove();
            }
        }
        document.getElementById('flash_conf_yes').onclick = () => {
            document.getElementById('flash_conf_box').style.display = 'none';
            resetFlashConfBtns();
            callback();
        }
        if (cancel_callback) {
            document.getElementById('flash_conf_no').onclick = () => {
                document.getElementById('flash_conf_box').style.display = 'none';
                resetFlashConfBtns();
                cancel_callback();
            }
        }
        document.getElementById('flash_conf_box').style.display = 'block';
    }
}

function insertCommas(float) {
    let f = parseFloat(float).toFixed(2);
    while ((f.indexOf('.') > 3 && f.indexOf(',') == -1) || f.indexOf(',') > 3) {
        f = f.substring(0, f.indexOf(',') == -1 ? f.indexOf('.') - 3 : f.indexOf(',') - 3) + ',' + f.substring(f.indexOf(',') == -1 ? f.indexOf('.') - 3 : f.indexOf(',') - 3);
    }
    return f;
}

function getDaysInMonth(m, y) { // m is index 0
    return m == 3 || m == 5 || m == 8 || m == 10 ? 30 : m == 1 && y%4 != 0 ? 28 : m == 1 && y%400 == 0 ? 29 : m == 1 && y%100 == 0 ? 28 : m == 1 ? 29 : 31;
}

// spreadsheet write functions
function batchUpdateValues(ranges, values, callback) {
    /*
    ranges = ['Journal!A1', 'Sheet2!B']
    values = [
        [['Journal!A1','Journal!B1'],['Journal!A2','Journal!B2']],
        [['Sheet!B1'],['Sheet2!B2']]
    ]
    */
    if (!Array.isArray(ranges)) {
        flash('DEBUG - target spreadsheet range must be an array');
        return;
    }
    if (ranges.length != values.length) {
        flash('DEBUG - number of ranges must match number of value sets');
        return;
    }
    const data = [];
    for (let i = 0; i < ranges.length; i++) {
        let range = ranges[i];
        let value = values[i];
        data.push({
            range: range,
            values: value,
        });
    }

    const body = {
        data: data,
        valueInputOption: 'RAW',
    };
    try {
        gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: ssid,
            resource: body,
        }).then((response) => {
            const result = response.result;
            console.log(`${result.totalUpdatedCells} cells updated.`);
            if (callback) callback(response);
        });
    } catch (err) {
        flash(err.message);
        return;
    }
}

async function appendValues(spreadsheetId, range, valueInputOption, _values, callback) {
    let values = [
        [
        // Cell values ...
        ],
        // Additional rows ...
    ];
    values = _values;
    const body = {
        values: values,
    };
    try {
        gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: valueInputOption,
            insertDataOption: 'INSERT_ROWS',
            resource: body,
        }).then((response) => {
            const result = response.result;
            console.log(`${result.updates.updatedCells} cells appended.`);
            if (callback) callback(response);
        });
    } catch (err) {
        flash(err.message);
        return;
    }
}

async function deleteRows(sheetName, startIndex0, endIndex0, callback) {
    if (!startIndex0 || !endIndex0) {
        return;
    }

    let sheetId;

    for (const sheet of ssprops.sheets) {
        if (sheet.properties.title == sheetName) {
            sheetId = sheet.properties.sheetId;
        }
    }

    let delete_response;
    try {
        delete_response = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: ssid,
            requests: [{
                deleteRange: {
                    /* Reference:
                        "range": {
                        // object (GridRange) 
                        "sheetId": ,//integer,
                        "startRowIndex": startIndex,//integer,
                        "endRowIndex": endIndex,//integer,
                        //"startColumnIndex": ,//integer,
                        //"endColumnIndex": ,//integer
                        },
                        "shiftDimension": 'ROWS';
                    */
                    range: {
                        sheetId: sheetId,
                        startRowIndex: startIndex0,
                        endRowIndex: endIndex0,
                    },
                    shiftDimension:'ROWS',
                }
            }]
        })
        if (callback) {
            callback(delete_response)
        };
    } catch (err) {
        flash(err.message);
        throw err;
    }
    if (!delete_response) {
        flash('Nope');
        return;
    }
}

async function insertRows(sheetName, startIndex0, endIndex0) {
    if (!startIndex0 || !endIndex0) {
        return;
    }
    let sheetId;
    for (const sheet of ssprops.sheets) {
        if (sheet.properties.title == sheetName) {
            sheetId = sheet.properties.sheetId;
        }
    }
    /* insertDimensionRequest
        {insertDimension:  {
            "range": {
                //object (DimensionRange)
                "sheetId": integer,
                "dimension": enum (Dimension), 'ROWS'|'COLUMNS'
                "startIndex": integer,
                "endIndex": integer
            },
            "inheritFromBefore": true|false
        }
        */
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: ssid,
            requests: [{
                insertDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: startIndex0,
                        endIndex: endIndex0,
                    },
                    inheritFromBefore: true,
                }
            }]
        });
    } catch(err) {
        flash(err.message);
        throw err;
    }
}

// uncategorized dom generation
function mk(element) { //make
    return document.createElement(element ? element : 'div');
}

function mkc(_class, _element) { // mk= make; c = by class name
    let el = document.createElement(_element ? _element : 'div');
    el.classList.add(_class);
    return el;
}

function getAcctOptEls(type, selected_acct_name) {
    let a = [];
    for (const acct of accts) {
        if (!type || (acct.length > 1 && acct[1].includes(type))) {
            let el = document.createElement('option');
            el.textContent = acct[0];
            el.value = acct[0];
            if (selected_acct_name) {
                if (selected_acct_name == acct[0]) {
                    el.selected = true;
                }
            }
            a.push(el);
        }
    }
    return a;
}

/*
module format:
create objects from spreadsheet data
modular dom generation
initialize/populate
create objects of dom elements
user interface/view handlers
user command handlers, validation
user command handlers updating spreadsheet
event dispatchers
*/

// BEGIN navbar control
function goToPage(page) {
    document.getElementById('nav_menu').value = page;

    let navBtns = document.getElementById('navbar_buttons');
    while (navBtns.firstChild) {
        navBtns.firstChild.remove();
    }

    for (const div of document.getElementsByClassName('main')) {
        div.style.display = 'none';
    }
    document.getElementById(page).style.display = 'block';
    localStorage.setItem('lastPageViewed', page);

    if (page == 'ledgers') initializeLedgers();
    if (page == 'eom_rev') initializeEomRev();
    if (page == 'rcrg') initializeRcrg();
    if (page == 'edit_accts')  initializeEditAccts();
    if (page == 'journal') initializeJournal();
}

function closeFlashMsg() {
    document.getElementById('flash_msg_box').style.display = 'none';
}

function closeFlashConf() {
    document.getElementById('flash_conf_box').style.display = 'none';
    document.getElementById('flash_conf_yes').onclick = '';
    document.getElementById('flash_conf').textContent = '';
}

let navbarClickHandler = function(e) {
    if (e.target.id == 'flash_msg_close') {
        closeFlashMsg();
    } else if (e.target.id == 'flash_conf_no') {
        closeFlashConf()
    }
}

let navbarChangeHandler = function(e) {
    if (e.target.id == 'nav_menu') goToPage(e.target.value);
}

// END navbar control BEGIN Add Journal Entry

function newBlankEntry(type) {
    const target = document.getElementById('add_entry');
    while (target.firstChild) {
        target.firstChild.remove();
    }
    let entry = getEntryInputLine({
        type: type,
        date: `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
    });
    editEntry(entry);
    target.append(entry);
}

function getEntryInputLine(e) {
    /*
    e = {
        type: exp/inc/tfr,
        rcrgindex: int,
        date: 'yyyy-mm-dd',
        desc: string,
        deb_accts: [string],
        deb_amts: [float],
        cred_accts: [string],
        cred_amts: [float],
        debits: float,
        credits: float,
        start_sheet_index1 = int,
    }
    */
    let typeVal = e.hasOwnProperty('type') ? e.type : '';
    let deb_acctsVal = e.hasOwnProperty('deb_accts') ? e.deb_accts : [];
    let deb_amtsVal = e.hasOwnProperty('deb_amts') ? e.deb_amts : [];
    let cred_acctsVal = e.hasOwnProperty('cred_accts') ? e.cred_accts : [];
    let cred_amtsVal = e.hasOwnProperty('cred_amts') ? e.cred_amts : [];

    let entry = mkc('entry');
    entry.dataset.origentry = JSON.stringify(e);

    let typebox = mkc('type_container');
    let exp_btn = mkc('exp_btn', 'button');
    exp_btn.textContent = 'expense';
    exp_btn.tabIndex = -1;
    exp_btn.disabled = true;
    let inc_btn = mkc('inc_btn', 'button');
    inc_btn.textContent = 'income';
    inc_btn.tabIndex = -1;
    inc_btn.disabled = true;
    let tfr_btn = mkc('tfr_btn', 'button');
    tfr_btn.textContent = 'transfer';
    tfr_btn.tabIndex = -1;
    tfr_btn.disabled = true;
    let gen_btn = mkc('gen_btn', 'button');
    gen_btn.textContent = 'general';
    gen_btn.tabIndex = -1;
    gen_btn.disabled = true;
    if (typeVal == 'exp') {
        exp_btn.classList.add('active_type');
    } else if (typeVal == 'inc') {
        inc_btn.classList.add('active_type');
    } else if (typeVal == 'tfr') {
        tfr_btn.classList.add('active_type');
    } else if (typeVal == '') {
        gen_btn.classList.add('active_type');
    }
    let split_btn  = mkc('split_entry', 'button');
    split_btn.textContent = 'split';
    split_btn.tabIndex = -1;
    split_btn.disabled = true;
    let add_deb = mkc('add_deb_acct', 'button');
    add_deb.textContent = 'add debit';
    add_deb.tabIndex = -1;
    add_deb.disabled = true;
    add_deb.style.display = 'none';
    let add_cred = mkc('add_cred_acct', 'button');
    add_cred.textContent = 'add credit';
    add_cred.tabIndex = -1;
    add_cred.disabled = true;
    add_cred.style.display = 'none';
    typebox.append(exp_btn, inc_btn, tfr_btn, gen_btn, split_btn, add_deb, add_cred);

    let details = mkc('details');
    
    let desc = mkc('desc','input');
    desc.name = 'desc';
    desc.placeholder = 'description';
    desc.disabled = true;
    desc.value = e.hasOwnProperty('desc') ? e.desc.includes('RCRG') ? e.desc.substring(0, e.desc.indexOf('RCRG')) : e.desc : '';
    details.append(desc);

    let date = mkc('date', 'input');
    date.type = 'date';
    date.value = e.hasOwnProperty('date') ? e.date : '';
    date.disabled = true;
    details.append(date);

    let deb_accts = mkc('deb_accts');

    const debs_header = mkc('entry_accts_header');
    const deb_lbl_wrap = mkc('side_label_wrap');
    const deb_lbl = mkc('debit_label', 'span');
    deb_lbl.textContent = 'debits:';
    deb_lbl_wrap.append(deb_lbl);
    const debs_wrap = mkc('deb_wrap');
    const debs = mkc('entry_debits', 'span');
    debs.textContent = '$' + insertCommas(e.debits);
    debs.style.display = deb_acctsVal.length > 1 ? 'inline' : 'none';
    debs_wrap.append(debs);
    debs_header.append(deb_lbl_wrap, debs_wrap);
    deb_accts.append(debs_header);

    if (deb_acctsVal.length == 0) {
        let div = getEntryAcct({side: 'deb', type: typeVal})
        deb_accts.append(div);
        deb_acctsVal.push('');
    } else {
        for (let i = 0; i < deb_acctsVal.length; i++) {
            let div = getEntryAcct({
                side: 'deb',
                type: typeVal,
                acct_name: deb_acctsVal[i],
                amt: deb_amtsVal[i],
            })
            deb_accts.append(div);
        }
    }
    
    let cred_accts = mkc('cred_accts');

    const creds_header = mkc('entry_accts_header');
    const cred_lbl_wrap = mkc('side_label_wrap');
    const cred_lbl = mkc('credit_label', 'span');
    cred_lbl.textContent = 'credits:';
    cred_lbl_wrap.append(cred_lbl);
    const creds_wrap = mkc('cred_wrap');
    const creds = mkc('entry_credits', 'span');
    creds.textContent = '$' + insertCommas(e.credits);
    creds.style.display = cred_acctsVal.length > 1 ? 'inline' : 'none';
    creds_wrap.append(creds);
    creds_header.append(cred_lbl_wrap, creds_wrap);
    cred_accts.append(creds_header);
    
    if (cred_acctsVal.length == 0) {
        let div = getEntryAcct({side: 'cred', type: typeVal})
        cred_accts.append(div);
        cred_acctsVal.push('');
    } else {
        for (let i = 0; i < cred_acctsVal.length; i++) {
            let div = getEntryAcct({
                side:'cred',
                type: typeVal,
                acct_name: cred_acctsVal[i],
                amt: cred_amtsVal[i],
            })
            cred_accts.append(div);
        }
    }

    let summary_div = mkc('entry_summary');
    if (!e.hasOwnProperty('desc')) { // it's a new blank entry
        let submit_button = mkc('submit_entry', 'button');
        submit_button.textContent = 'Submit';
        summary_div.append(submit_button);
    } else {
        let edit_btn = mkc('edit_entry', 'button');
        edit_btn.textContent = 'edit';
        let cancel_btn = mkc('cancel_entry', 'button');
        cancel_btn.textContent = 'cancel';
        cancel_btn.style.display = 'none';
        let save_btn = mkc('save_entry', 'button');
        save_btn.textContent = 'save';
        save_btn.style.display = 'none';
        let del_btn = mkc('delete_entry', 'button');
        del_btn.textContent = 'delete';
        del_btn.style.display = 'none';
        let mkrcrg_btn = mkc('make_rcrg_entry', 'button');
        mkrcrg_btn.textContent = 'make recurring';
        mkrcrg_btn.style.display = e.hasOwnProperty('rcrgindex') ? 'none' : 'inline';
        summary_div.append(edit_btn, cancel_btn, save_btn, del_btn, mkrcrg_btn);
    }
    entry.append(details, typebox, deb_accts, cred_accts, summary_div);
    const els = getEntryInputElements(entry);
    showHideEntryAcctBtns(els);
    return entry;
}

function getEntryAcct(opts) {
    /*
    opts = {
        side: 'debit'|'credit',
        type: 'exp'|'inc'|'tfr',
        acct_name: ,
        amtVal: ,
    }
    */
    // returns div.entry_acct to be child of div.deb_accts or div.cred_accts within div.entry
    if (!opts) {
        opts = {};
    }
    let side = opts.hasOwnProperty('side') ? opts.side : 'deb';
    let type = opts.hasOwnProperty('type') ? opts.type : '';
    let acct_name = opts.hasOwnProperty('acct_name') ? opts.acct_name : '';
    let amtVal = opts.hasOwnProperty('amt') ? parseFloat(opts.amt).toFixed(2) : '';

    let div = mkc('entry_acct');

    let acct_select = mkc(`${side}_acct`, 'select');
    acct_select.name = `${side}_acct`;
    acct_select.disabled = true;

    let first_opt = document.createElement('option');
    first_opt.value = '';
    let options = [];
    if (type == 'exp') {
        first_opt.textContent = side == 'deb' ? 'expense category...' : 'from account...';
        options = getAcctOptEls(side == 'deb' ? 'E' : 'P', acct_name);
    } else if (type == 'inc') {
        first_opt.textContent = side == 'deb' ? 'into account...' : 'income source...';
        options = getAcctOptEls(side == 'deb' ? 'A' : 'R', acct_name);
    } else if (type == 'tfr') {
        first_opt.textContent = side == 'deb' ? 'into account...' : 'from account...';
        options = getAcctOptEls('A', acct_name);
        for (const opt of getAcctOptEls('L', acct_name)) {
            options.push(opt);
        }
    } else {
        first_opt.textContent = side == 'deb' ? 'account to debit...' : 'account to credit...';
        options = getAcctOptEls('', acct_name);
    }
    let newacct = mk('option');
    newacct.textContent = '(add new...)';
    newacct.value = '***';
    acct_select.append(first_opt, newacct);
    for (const opt of options) {
        acct_select.append(opt);
    }

    let rem_button = mkc(`rem_${side}_acct`, 'button');
    rem_button.textContent = '\u2212';
    rem_button.disabled = true;

    let amt = mkc(`${side}_amt`, 'input');
    amt.name = `${side}_amt`;
    amt.type = 'number';
    amt.step = '0.01';
    amt.min = '0.01';
    amt.max = '99999.99';
    amt.placeholder = '$0.00';
    amt.disabled = true;
    amt.value = amtVal;
    
    div.append(acct_select);
    if (side == 'deb') {
        div.append(amt, rem_button);
    } else {
        div.append(rem_button, amt);
    }
    return div;
}

function getEntryInputElements(entry_container) {
    /* returns {
        entry_data: entryDataObj,
        container:,
        date:,
        desc:,
        exp:,
        inc:,
        tfr:,
        gen:,
        split:,
        add_deb:,
        add_cred:,
        debits:,
        deb_accts: [],
        rem_deb_acct_btns: [],
        deb_amts: [],
        credits:,
        cred_accts: [],
        rem_cred_acct_btns: [],
        cred_amts: [],
        submit:,
        edit:,
        cancel:,
        save:,
        mkrcrg:,
    }
    */
    let entryDataObj = JSON.parse(entry_container.dataset.origentry);
    let els = {
        entry_data: entryDataObj,
        container: entry_container,
        deb_accts: [],
        rem_deb_acct_btns: [],
        deb_amts: [],
        cred_accts: [],
        rem_cred_acct_btns: [],
        cred_amts: [],
    };
    function checkChildren(parent) {
        for (const child of parent.children) {
            if (child.classList.contains('desc')) {
                els.desc = child;
                continue;
            }
            if (child.classList.contains('date')) {
                els.date = child;
                continue;
            }
            if (child.classList.contains('debit_label')) {
                els.debLbl = child;
                continue;
            }
            if (child.classList.contains('entry_debits')) {
                els.debits = child;
                continue;
            }
            if (child.classList.contains('deb_acct')) {
                els.deb_accts.push(child);
                continue;
            }
            if (child.classList.contains('rem_deb_acct')) {
                els.rem_deb_acct_btns.push(child);
            }
            if (child.classList.contains('deb_amt')) {
                els.deb_amts.push(child);
                continue;
            }
            if (child.classList.contains('credit_label')) {
                els.credLbl = child;
                continue;
            }
            if (child.classList.contains('entry_credits')) {
                els.credits = child;
                continue;
            }
            if (child.classList.contains('cred_acct')) {
                els.cred_accts.push(child);
                continue;
            }
            if (child.classList.contains('rem_cred_acct')) {
                els.rem_cred_acct_btns.push(child);
            }
            if (child.classList.contains('cred_amt')) {
                els.cred_amts.push(child);
                continue;
            }
            if (child.classList.contains('exp_btn')) {
                els.exp = child;
                continue;
            }
            if (child.classList.contains('inc_btn')) {
                els.inc = child;
                continue;
            }
            if (child.classList.contains('tfr_btn')) {
                els.tfr = child;
                continue;
            }
            if (child.classList.contains('gen_btn')) {
                els.gen = child;
                continue;
            }
            if (child.classList.contains('split_entry')) {
                els.split = child;
                continue;
            }
            if (child.classList.contains('add_deb_acct')) {
                els.add_deb = child;
                continue;
            }
            if (child.classList.contains('add_cred_acct')) {
                els.add_cred = child;
                continue;
            }
            if (child.classList.contains('submit_entry')) {
                els.submit = child;
                continue;
            }
            if (child.classList.contains('edit_entry')) {
                els.edit = child;
                continue;
            }
            if (child.classList.contains('cancel_entry')) {
                els.cancel = child;
                continue;
            }
            if (child.classList.contains('save_entry')) {
                els.save = child;
                continue;
            }
            if (child.classList.contains('delete_entry')) {
                els.delete = child;
                continue;
            }
            if (child.classList.contains('make_rcrg_entry')) {
                els.mkrcrg = child;
                continue;
            }

            if (child.children) {
                checkChildren(child);
            }
        }
    }
    checkChildren(entry_container);

    return els;
}

function entryAmtChanged(target) {
    target.value = parseFloat(target.value) ? parseFloat(target.value).toFixed(2) : '';
    const entry_container = target.parentElement.parentElement.parentElement;
    const els = getEntryInputElements(entry_container);
    if (els.deb_amts.length == 1 && els.cred_amts.length == 1) {
        if (target.classList.contains('deb_amt')) {
            els.cred_amts[0].value = target.value;  // we already sanitized the target's value above
        } else {
            els.deb_amts[0].value = target.value;
        }
    }
    entryAmtAutoComplete(els);
}

function entryAcctChanged(target) {
    if (target.value == '***') {
        if (!isSignedIn(() => {
            let acct_row = target.parentElement;
            let entry_line = acct_row.parentElement.parentElement;
            let type = getEntryInputElements(entry_line).entry_data.type;
            let side = target.classList.contains('deb_acct') ? 'deb' : 'cred';
            let typecode = type == 'exp' ? side == 'deb' ? 'E' : 'P'
                         : type == 'inc' ? side == 'deb' ? 'A' : 'R' 
                         : '';
            let div = getNewAcctLine({typecodes: typecode});
            div.classList.add('popunder');
            acct_row.after(div); 
        })) {
            target.value = '';
        }
    }
}

function entryAmtAutoComplete(els) {
    els.debits.classList.remove('popunder');
    els.credits.classList.remove('popunder');

    // clear any previous autocomplete:
    if (document.getElementById('split_entry_difference')) document.getElementById('split_entry_difference').remove();
    
    if (els.deb_amts.length == 1 && els.cred_amts.length == 1) {
        let amt = parseFloat(els.deb_amts[0].value ? els.deb_amts[0].value : 0); // we already made deb and cred amt the same in the event dispatcher
        if (amt != 0) {
            els.deb_amts[0].classList.remove('error');
            els.cred_amts[0].classList.remove('error');
        }
        else {
            els.deb_amts[0].value = '';
            els.cred_amts[0].value = '';
        }
        els.debits.textContent = '';
        els.debits.style.display = 'none';
        els.credits.textContent = '';
        els.credits.style.display = 'none';
        els.debits.classList.remove('error');
        els.credits.classList.remove('error');
    } else {
        // total everything up and see if there's only one empty amount
        let debits = 0;
        let credits = 0;
        let emptyAmts = 0;
        for (let i = 0; i < els.deb_amts.length + els.cred_amts.length; i++) {
            if (i < els.deb_amts.length) {
                els.deb_amts[i].setAttribute('list', null);
                if (!parseFloat(els.deb_amts[i].value)) {
                    emptyAmts++;
                } else {
                    debits += parseFloat(els.deb_amts[i].value);
                    els.deb_amts[i].classList.remove('error');
                }
            } else {
                const j = i - els.deb_amts.length;
                els.cred_amts[j].setAttribute('list', null);
                if (!parseFloat(els.cred_amts[j].value)) {
                    emptyAmts++;
                } else {
                    credits += parseFloat(els.cred_amts[j].value);
                    els.cred_amts[j].classList.remove('error');
                }
            }
        }
        
        // update summaries
        els.debits.textContent = '$' + insertCommas(debits);
        els.debits.style.display = els.deb_amts.length > 1 ? 'inline' : 'none';
        els.credits.textContent = '$' + insertCommas(credits);
        els.credits.style.display = els.cred_amts.length > 1 ? 'inline' : 'none';
        if (debits.toFixed(2) == credits.toFixed(2)) {
            els.debits.classList.remove('error');
            els.credits.classList.remove('error');
        }

        // create autocomplete
        if (emptyAmts == 1) {
            let balance = Math.abs(debits - credits).toFixed(2);
            let datalist = mk('datalist');
            datalist.id = 'split_entry_difference';
            let amt = mk('option');
            amt.value = balance;
            datalist.append(amt);
            els.container.append(datalist);
            for (let i = 0; i < els.deb_amts.length + els.cred_amts.length; i++) {
                if (i < els.deb_amts.length) {
                    if (!parseFloat(els.deb_amts[i].value)) {
                        els.deb_amts[i].setAttribute('list', 'split_entry_difference');
                        break;
                    }
                } else {
                    if (!parseFloat(els.cred_amts[i - els.deb_amts.length].value)) {
                        els.cred_amts[i - els.deb_amts.length].setAttribute('list', 'split_entry_difference');
                        break;
                    }
                }
            }
        }
    }
}

function updateEntryOpts(entry_line, _type) {
    let type = _type ? _type : '';
    let els = getEntryInputElements(entry_line);
    let entry_data = els.entry_data;
    entry_data.type = type;
    entry_line.dataset.origentry = JSON.stringify(entry_data);
    for (let i = 0; i < els.deb_accts.length + els.cred_accts.length; i++) {
        const select = i < els.deb_accts.length ? els.deb_accts[i] : els.cred_accts[i - els.deb_accts.length];
        const prevSelectedValue = select.value;
        const origValue = i < els.deb_accts.length ? entry_data.hasOwnProperty('deb_accts') ? entry_data.deb_accts[i] : '' : entry_data.hasOwnProperty('cred_accts') ? entry_data.cred_accts[i - els.deb_accts.length] : '';
        const side =  i < els.deb_accts.length ? 'deb' : 'cred';
        while (select.firstChild) {
            select.firstChild.remove();
        }
        let first_opt = document.createElement('option');
        first_opt.value = '';
        let options = [];
        if (type == 'exp') {
            first_opt.textContent = side == 'deb' ? 'expense category...' : 'from account...';
            options = getAcctOptEls(side == 'deb' ? 'E' : 'P');
        } else if (type == 'inc') {
            first_opt.textContent = side == 'deb' ? 'into account...' : 'income source...';
            options = getAcctOptEls(side == 'deb' ? 'A' : 'R');
        } else if (type == 'tfr') {
            first_opt.textContent = side == 'deb' ? 'into account...' : 'from account...';
            options = getAcctOptEls('A');
            for (const opt of getAcctOptEls('L')) {
                options.push(opt);
            }
        } else {
            first_opt.textContent = side == 'deb' ? 'account to debit...' : 'account to credit...';
            options = getAcctOptEls('');
        }
        let newacct = mk('option');
        newacct.textContent = '(add new...)';
        newacct.value = '***';
        select.append(first_opt, newacct);
        let prevValueInOptions;
        let origValueInOptions;
        for (const opt of options) {
            select.append(opt);
            if (opt.value == prevSelectedValue) prevValueInOptions = prevSelectedValue;
            if (opt.value == origValue) origValueInOptions = origValue;
        }
        select.value = prevValueInOptions ? prevValueInOptions : origValueInOptions ? origValueInOptions : '';
    }
    if (type == 'exp') {
        els.exp.classList.add('active_type');
        els.inc.classList.remove('active_type');
        els.tfr.classList.remove('active_type');
        els.gen.classList.remove('active_type');
    }
    if (type == 'inc') {
        els.exp.classList.remove('active_type');
        els.inc.classList.add('active_type');
        els.tfr.classList.remove('active_type');
        els.gen.classList.remove('active_type');
    }
    if (type == 'tfr') {
        els.exp.classList.remove('active_type');
        els.inc.classList.remove('active_type');
        els.tfr.classList.add('active_type');
        els.gen.classList.remove('active_type');
    }
    if (type == '') {
        els.exp.classList.remove('active_type');
        els.inc.classList.remove('active_type');
        els.tfr.classList.remove('active_type');
        els.gen.classList.add('active_type');
    }
}

function validateEntryInputs(entry_container, quiet) {
    let errors = [];
    let els = getEntryInputElements(entry_container);
    if (!els.date.value) {
        errors.push('Date is missing.');
        if (!quiet) els.date.classList.add('error');
    } else {
        els.date.classList.remove('error');
    }
    subValidateDesc(els.desc, errors, quiet);
    subValidateAcctNames(els, errors, quiet);
    showHideEntryAcctBtns(els);
    subValidateEntryAmts(els, errors, quiet);
    
    if (errors.length > 0 && !quiet) {
        let text = '';
        for (const error of errors) {
            text += error + ' ';
        }
        flash(text);
        return false;
    } else if (errors.length == 0) {
        return true;
    }
}

function subValidateDesc(descInputDOM, errorsArr, quiet) {
    let desc = descInputDOM.value;
    if (!desc) {
        errorsArr.push('Description is missing.');
        if (!quiet) descInputDOM.classList.add('error');
    } else if (desc.includes('RCRG')) {
        errorsArr.push('Description cannot contain the sequence "RCRG"');
        if (!quiet) descInputDOM.classList.add('error');
    } else if (desc.substring(0,13) == 'OPENING ENTRY') {
        errorsArr.push('Description cannot begin with "OPENING ENTRY"');
        if (!quiet) descInputDOM.classList.add('error');
    } else if (desc.substring(0,13) == 'CLOSING ENTRY') {
        errorsArr.push('Description cannot begin with "CLOSING ENTRY"');
        if (!quiet) descInputDOM.classList.add('error');
    } else {
        descInputDOM.classList.remove('error');
    }
}

function subValidateAcctNames(els, errorsArr, quiet) {
    let missingAcct;
    for (let i = 0; i < els.deb_accts.length; i++) {
        if (!els.deb_accts[i].value || els.deb_accts[i].value == '***') {
            missingAcct = true;
            if (!quiet) els.deb_accts[i].classList.add('error');
        } else {
            els.deb_accts[i].classList.remove('error');
        }
    }
    for (let i = 0; i < els.cred_accts.length; i++) {
        if (!els.cred_accts[i].value || els.cred_accts[i].value == '***') {
            missingAcct = true;
            if (!quiet) els.cred_accts[i].classList.add('error');
        } else {
            els.cred_accts[i].classList.remove('error');
        }
    }
    if (missingAcct) errorsArr.push('Missing account.')
}

function subValidateEntryAmts(els, errorsArr, quiet) {
    entryAmtAutoComplete(els); // this removes any error class and locks/unlocks
    let debits = 0;
    let credits = 0;
    let missingAmt = false;
    for (let i = 0; i < els.deb_amts.length; i++) {
        if (!els.deb_amts[i].value) {
            missingAmt = true;
            if (!quiet) els.deb_amts[i].classList.add('error');
        }
        debits += els.deb_amts[i].value ? parseFloat(els.deb_amts[i].value) : 0;
    }
    for (let i = 0; i < els.cred_amts.length; i++) {
        if (!els.cred_amts[i].value) {
            missingAmt = true;
            if (!quiet) els.cred_amts[i].classList.add('error');
        }
        credits += els.cred_amts[i].value ? parseFloat(els.cred_amts[i].value) : 0;
    }
    if (missingAmt == true) errorsArr.push('Missing amount.');
    if (debits.toFixed(2) != credits.toFixed(2)) {
        errorsArr.push('Total debits must equal total credits.');
        if (!quiet) els.debits.classList.add('error');
        if (!quiet) els.credits.classList.add('error');
    }
}

function showHideEntryAcctBtns(els) {
    if (els.deb_amts.length == 1 && els.cred_amts.length == 1) {
        els.rem_deb_acct_btns[0].style.display = 'none';
        els.rem_cred_acct_btns[0].style.display = 'none';
    }
    if (els.deb_amts.length > 1 && els.cred_amts.length == 1) {
        for (let i = 0; i < els.deb_amts.length; i++) {
            els.rem_deb_acct_btns[i].style.display = 'inline';
        }
        els.rem_cred_acct_btns[0].style.display = 'none';
    }
    if (els.deb_amts.length == 1 && els.cred_amts.length > 1) {
        for (let i = 0; i < els.cred_amts.length; i++) {
            els.rem_cred_acct_btns[i].style.display = 'inline';
        }
        els.rem_deb_acct_btns[0].style.display = 'none';
    }
    if (els.deb_amts.length > 1 && els.cred_amts.length > 1) {
        for (let i = 0; i < els.deb_amts.length; i++) {
            els.rem_deb_acct_btns[i].style.display = 'inline';
        }
        for (let i = 0; i < els.cred_amts.length; i++) {
            els.rem_cred_acct_btns[i].style.display = 'inline';
        }
    }
}

function addToEntryQueue(entries) {
    let queued = localStorage.getItem('entryQueue') ? JSON.parse(localStorage.getItem('entryQueue')) : [];
    if (entries.length) {
        for (const e of entries) {
            queued.push(e);
            journal.push(e);
        }
        localStorage.setItem('entryQueue', JSON.stringify(queued));
    }
    if (isSignedIn()) {
        uploadEntryQueue();
    } else if (queued.length == entries.length) {
        flash('Entry stored on your device until next sign-in. Sync now?', () => {
            tokenClient.callback = (resp) => {
                if (resp.error !== undefined) {
                    throw(resp);
                }
                justGotToken(); // upload entries happens here
            }
            tokenClient.requestAccessToken();
        })
    } else {
        flash('Entry stored. Sign in to sync.');
    }

}

async function uploadEntryQueue(callback) {
    let queued = localStorage.getItem('entryQueue') ? JSON.parse(localStorage.getItem('entryQueue')) : [];
    let success = function (response) {
        localStorage.removeItem('entryQueue');
        flash('Entry saved')
        if (callback) callback(response);
    }
    if (queued.length > 0 && isSignedIn()) {
        appendValues(ssid, "Journal!A1", 'RAW', queued, success);
    }
}

function entryAddAcctClk(entry_container, side) {
    let data = JSON.parse(entry_container.dataset.origentry);
    let type = data.hasOwnProperty('type') ? data.type : '';
    let div = getEntryAcct({side: side, type: type});
    for (const el of div.children) {
        el.disabled = false;
    }
    for (const accts_container of entry_container.children) {
        if (accts_container.classList.contains('deb_accts') && side == 'deb') {
            accts_container.append(div);
            break;
        }
        if (accts_container.classList.contains('cred_accts') && side == 'cred') {
            accts_container.append(div);
            break;
        }
    }
    let els = getEntryInputElements(entry_container);
    showHideEntryAcctBtns(els);
    entryAmtAutoComplete(els);
    els.split.style.display = 'inline';
    els.add_deb.style.display = 'none';
    els.add_cred.style.display = 'none';
}

function entryRemAcctClk(entry_acct_div) {
    let entry_container = entry_acct_div.parentElement.parentElement;
    entry_acct_div.remove();
    let els = getEntryInputElements(entry_container);
    showHideEntryAcctBtns(els);
    entryAmtAutoComplete(els);
}

function splitEntry(entry_line) {
    let els = getEntryInputElements(entry_line);
    els.split.style.display = 'none';
    els.add_deb.style.display = 'inline';
    els.add_cred.style.display = 'inline';
}

function submitEntry(entry_container) {
    if (validateEntryInputs(entry_container)) {
        let els = getEntryInputElements(entry_container);
        let entries = [];
        let desc;
        if (els.entry_data.hasOwnProperty('rcrgindex')) {
            desc = els.desc.value + ' RCRG' + els.entry_data.rcrgindex;
        } else {
            desc = els.desc.value;
        }
        for (let i = 0; i < els.deb_accts.length + els.cred_accts.length; i++) {
            let entry = [
                els.date.value, 
                els.entry_data.hasOwnProperty('rcrgindex') ? els.desc.value + ' RCRG' + els.entry_data.rcrgindex : els.desc.value
            ];
            if (i < els.deb_accts.length) {
                entry.push(els.deb_accts[i].value);
                entry.push(els.deb_amts[i].value);
                entry.push('');
            } else {
                let j = i - els.deb_accts.length;
                entry.push(els.cred_accts[j].value);
                entry.push('');
                entry.push(els.cred_amts[j].value);
            }
            entries.push(entry);
        }
        addToEntryQueue(entries);

        entry_container.remove();
        let template = {
            type: els.entry_data.hasOwnProperty('type') ? els.entry_data.type : '',
            date: els.date.value
        };
        let div = getEntryInputLine(template);
        editEntry(div);
        let target = document.getElementById('add_entry');
        while (target.firstChild) {
            target.firstChild.remove();
        }
        target.append(div);
    }
}

let addEntryClickHandler = function(e) {
    if (e.target.classList.contains('add_deb_acct')) {
        let accts_container = e.target.parentElement.parentElement;
        entryAddAcctClk(accts_container, 'deb');
    } else if (e.target.classList.contains('add_cred_acct')) {
        let accts_container = e.target.parentElement.parentElement;
        entryAddAcctClk(accts_container, 'cred');
    } else if (e.target.classList.contains('rem_deb_acct') || e.target.classList.contains('rem_cred_acct')) {
        let entry_acct_div = e.target.parentElement;
        entryRemAcctClk(entry_acct_div);
    } else if (e.target.classList.contains('submit_entry')) {
        let entry_container = e.target.parentElement.parentElement;
        submitEntry(entry_container);
    } else if (e.target.classList.contains('exp_btn')) {
        let entry_container = e.target.parentElement.parentElement;
        updateEntryOpts(entry_container, 'exp');
    } else if (e.target.classList.contains('inc_btn')) {
        let entry_container = e.target.parentElement.parentElement;
        updateEntryOpts(entry_container, 'inc');
    } else if (e.target.classList.contains('tfr_btn')) {
        let entry_container = e.target.parentElement.parentElement;
        updateEntryOpts(entry_container, 'tfr');
    } else if (e.target.classList.contains('gen_btn')) {
        let entry_container = e.target.parentElement.parentElement;
        updateEntryOpts(entry_container, '');
    } else if (e.target.classList.contains('split_entry')) {
        let entry_container = e.target.parentElement.parentElement;
        splitEntry(entry_container);
    }
}

let addEntryChangeHandler = function(e) {
    if (e.target.classList.contains('deb_amt') || e.target.classList.contains('cred_amt')) {
        entryAmtChanged(e.target);
    } else if (e.target.classList.contains('deb_acct') || e.target.classList.contains('cred_acct')) {
        entryAcctChanged(e.target)
    }
    // clear error if has value:
    if ((e.target.classList.contains('desc') || e.target.classList.contains('date') || e.target.classList.contains('deb_acct') || e.target.classList.contains('cred_acct')) && e.target.value) e.target.classList.remove('error');
}

let addEntryFocusHandler = function(e) {
    if ((e.target.classList.contains('deb_amt') || e.target.classList.contains('cred_amt')) && parseFloat(e.target.value) === 0 && e.target.value.includes('.')) {
        e.target.value = '';
    }
}

// END  Add Journal Entry BEGIN Edit Journal Entry

function processJournal(raw, startingSSRowIndex1) {
    /* returns [{
        type: exp/inc/tfr,
        rcrgindex: int,
        date: 'yyyy-mm-dd',
        desc: string,
        deb_accts: [string],
        deb_amts: [float],
        cred_accts: [string],
        cred_amts: [float],
        debits: float,
        credits: float,
        start_sheet_index1 = int,
    }]
    raw = [[
        date str 'yyyy-mm-dd',
        description string,
        account name string, 
        debit amount string (e.g., '54.32') or '',
        credit amount string (e.g., '54.32') or undefined
    ]]
    global journal[0] startingSSRowIndex1 is 2, because row 1 in the master spreadsheet is the column labels, not fetched by q͜ʘ
    */

    function finalize(entry) {
        let isExp = true;
        let isInc = true;
        let isTfr = true;
        for (const acct of entry.deb_accts) {
            for (const row of accts) {
                if (row[0] == acct) {
                    if (row.length == 1 || (row.length > 1 && !row[1].includes('E'))) {
                        isExp = false;
                    }
                    if (row.length == 1 || (row.length > 1 && (!row[1].includes('A') && !row[1].includes['L']))) {
                        isInc = false;
                        isTfr = false;
                    }
                }
            }
        }
        for (const acct of entry.cred_accts) {
            for (const row of accts) {
                if (row[0] == acct) {
                    if (row.length == 1 || (row.length > 1 && !row[1].includes('R'))) {
                        isInc = false;
                    }
                    if (row.length == 1 || (row.length > 1 && (!row[1].includes('A') && !row[1].includes['L']))) {
                        isExp = false;
                        isTfr = false;
                    }
                }
            }
        }
        if (isExp === true && !isInc && !isTfr) {
            entry.type = 'exp';
        }
        if (!isExp && isInc === true && !isTfr) {
            entry.type = 'inc';
        }
        if (!isExp && !isInc && isTfr === true) {
            entry.type = 'tfr';
        }
        returned.push(entry);
    }

    let returned = [];
    let entry = {
        desc: '',
        deb_accts: [],
        deb_amts: [],
        cred_accts: [],
        cred_amts: [],
        debits: 0,
        credits: 0,
    };
    if (parseInt(startingSSRowIndex1)) entry.start_sheet_index1 = parseInt(startingSSRowIndex1);

    for (let i = 0; i < raw.length; i++) {
        let date = raw[i][0];
        let desc = raw[i][1];
        let acct = raw[i][2];
        let deb = raw[i][3];
        let cred = raw[i][4];
        if (i > 0 && (date != raw[i-1][0] || desc != raw[i-1][1])) {
            finalize(entry);
            entry = {
                desc: '',
                deb_accts: [],
                deb_amts: [],
                cred_accts: [],
                cred_amts: [],
                debits: 0,
                credits: 0,
            };
            if (parseInt(startingSSRowIndex1)) entry.start_sheet_index1 = i + parseInt(startingSSRowIndex1);
        }
        entry.date = date;
        entry.desc = desc;
        if (desc.includes('RCRG')) entry.rcrgindex = parseInt(desc.substring(desc.indexOf('RCRG') + 4));

        if (deb && (!cred || parseFloat(cred) === 0)) {
            entry.deb_accts.push(acct);
            entry.deb_amts.push(parseFloat(deb) ? parseFloat(deb) : parseFloat(deb) === 0 ? 0 : '');
            entry.debits += parseFloat(deb) ? parseFloat(deb) : 0;
            entry.debits = parseFloat(entry.debits.toFixed(2)); // we want to return a mathable number. This tries to round it off but must do toFixed(2) again when displaying 
        }
        if ((!deb || parseFloat(deb) === 0) && cred) {
            entry.cred_accts.push(acct);
            entry.cred_amts.push(parseFloat(cred) ? parseFloat(cred) : parseFloat(cred) === 0 ? 0 : '');
            entry.credits += parseFloat(cred) ? parseFloat(cred) : 0;
            entry.credits = parseFloat(entry.credits.toFixed(2));
        }

        if (i == raw.length - 1) {
            finalize(entry);
        }
    }
    return returned;
}

function getJournalEntriesByDate(fromDate, toDate) {
    let fetched = [];
    let fetchedStartingSSRow = 2;
    let entryList = [];
    for (let i = 0; i < journal.length; i++) {
        let row = journal[i];
        let rowDate = row[0];
        if ((isDateBefore(fromDate, rowDate) || fromDate == rowDate ) &&
            (isDateBefore(rowDate, toDate) || toDate == rowDate)) {
                fetched.push(row);
        } else if (i < journal.length - 1) {
            if (fetched.length > 0) {
                let entries = processJournal(fetched, fetchedStartingSSRow);
                for (const e of entries) entryList.push(e);
                fetched = [];
            }
            fetchedStartingSSRow = i + 3; // +1 for index 1, +1 because the header row isn't in the journal array, and +1 because we're setting it for the next iteration
        }
        if (i == journal.length - 1) {
            if (fetched.length > 0) {
                let entries = processJournal(fetched, fetchedStartingSSRow);
                for (const e of entries) entryList.push(e);
            }
        }
    }
    entryList = mergeSortEntriesByDate(entryList);
    return entryList;
}

function mergeSortEntriesByDate(arr) {
    function mergeEntriesByDate(left, right) {
        let sorted = [];
        while (left.length && right.length) {
            if (isDateBefore(left[0].date, right[0].date)) {
                sorted.push(left.shift());
            } else {
                sorted.push(right.shift());
            }
        }
        return [...sorted, ...left, ...right];
    }
    if (arr.length <= 1) return arr;
    let mid = Math.floor(arr.length / 2);
    let left = mergeSortEntriesByDate(arr.slice(0, mid));
    let right = mergeSortEntriesByDate(arr.slice(mid));
    return mergeEntriesByDate(left, right);
}

function isDateBefore(date1, date2) { // 'yyyy-mm-dd'
    let sy = parseInt(date1.substring(0,4));
    let sm = parseInt(date1.substring(5,7));
    let sd = parseInt(date1.substring(8));
    let ty = parseInt(date2.substring(0,4));
    let tm = parseInt(date2.substring(5,7));
    let td = parseInt(date2.substring(8));
    return (sy < ty) || (sy == ty && sm < tm) || (sy == ty && sm == tm && sd < td)
}

function initializeJournal() {
    let fromdate = document.createElement('input');
    fromdate.type = 'date';
    fromdate.id = 'journal_from_date';
    fromdate.value = `${today.getFullYear()}-01-01`;
    let s = document.createElement('label');
    s.textContent = 'to';
    let todate = document.createElement('input');
    todate.type = 'date';
    todate.id = 'journal_to_date';
    todate.value = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${(today.getDate()).toString().padStart(2, '0')}`;
    let btn = document.createElement('button');
    btn.textContent = 'view';
    btn.onclick = displayJournalEntriesByDate;
    document.getElementById('navbar_buttons').append(fromdate, s, todate, btn);
}

let displayJournalEntriesByDate = function() {
    let fdt = document.getElementById('journal_from_date').value;
    let tdt = document.getElementById('journal_to_date').value;
    let entryList = getJournalEntriesByDate(fdt, tdt);
    let target = document.getElementById('journal');
    while (target.firstChild) target.firstChild.remove();
    for (const entry of entryList) target.append(getEntryInputLine(entry));
}

async function doIfEntryStillSynced(entry_line, callback) { // calling function will have already checked if we're signed in
    const localOrigEntry = getEntryInputElements(entry_line).entry_data;
    const start_row = localOrigEntry.start_sheet_index1;
    const end_row = start_row - 1 + localOrigEntry.deb_accts.length + localOrigEntry.cred_accts.length;
    let database_response;
    try {
        database_response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: ssid,
            ranges: [`Journal!A${start_row}:E${end_row + 1}`] // we are pulling one extra line. If the live entry has gained an additional account, only pulling the number of accounts from the local entry would not find that. However, if we pull one more row and it has the same date and description, the total number of accounts won't match in the processed entries below. If the entries are still synced, the extra row is ignored by only looking at the first processed entry below.
        });
    } catch(err) {
        flash('Error');
        throw err;
    }
    let entryOnLiveDB = processJournal(database_response.result.valueRanges[0].values)[0];
    if (localOrigEntry.date == entryOnLiveDB.date && localOrigEntry.desc == entryOnLiveDB.desc && localOrigEntry.deb_accts.length == entryOnLiveDB.deb_accts.length && localOrigEntry.cred_accts.length == entryOnLiveDB.cred_accts.length) {
        callback();
    } else {
        flash('Entry in journal has become unsynced. Please try again.');
        await bha_sync();
        entry_line.remove();
        displayJournalEntriesByDate();
    }
}

function editEntry(entry_line) {
    // we're not checking to see if signed in here because we use this function when populating displays of 
    let els = getEntryInputElements(entry_line);
    els.date.disabled = false;
    els.desc.disabled = false;
    els.exp.disabled = false;
    els.inc.disabled = false;
    els.tfr.disabled = false;
    els.gen.disabled = false;
    els.split.disabled = false;
    els.add_deb.disabled = false;
    els.add_cred.disabled = false;
    if (els.edit) {
        els.edit.style.display = 'none';
        els.edit.disabled = true;
    }
    if (els.cancel) {
        els.cancel.style.display = 'inline';
        els.cancel.disabled = false;
    }
    if (els.save) {
        els.save.style.display = 'inline';
        els.save.disabled = false;
    }
    if (els.delete) {
        els.delete.style.display = 'inline';
        els.delete.disabled = false;
    }

    for (let i = 0; i < els.deb_accts.length; i++) {
        els.deb_accts[i].disabled = false;
        els.rem_deb_acct_btns[i].disabled = false;
        els.deb_amts[i].disabled = false;
    }
    for (let i = 0; i < els.cred_accts.length; i++) {
        els.cred_accts[i].disabled = false;
        els.rem_cred_acct_btns[i].disabled = false;
        els.cred_amts[i].disabled = false;
    }
    entryAmtAutoComplete(els); // in case it was last edited missing an amount
}

function cancelEditEntry(entry_line) {
    let els = getEntryInputElements(entry_line);
    els.date.disabled = true;
    els.desc.disabled = true;
    els.exp.disabled = true;
    els.inc.disabled = true;
    els.tfr.disabled = true;
    els.gen.disabled = true;
    els.split.disabled = true;
    els.add_deb.disabled = true;
    els.add_cred.disabled = true;
    els.edit.style.display = 'inline';
    els.edit.disabled = false;
    els.cancel.style.display = 'none';
    els.cancel.disabled = true;
    els.save.style.display = 'none';
    els.save.disabled = true;
    els.delete.style.display = 'none';
    els.delete.disabled = true;
    for (let i = 0; i < els.deb_accts.length; i++) {
        els.deb_accts[i].disabled = true;
        els.rem_deb_acct_btns[i].disabled = true;
        els.deb_amts[i].disabled = true;
    }
    for (let i = 0; i < els.cred_accts.length; i++) {
        els.cred_accts[i].disabled = true;
        els.rem_cred_acct_btns[i].disabled = true;
        els.cred_amts[i].disabled = true;
    }
}

function saveEntry(entry_line) { 
    isSignedIn(() => {
        if (validateEntryInputs(entry_line)) {
            doIfEntryStillSynced(entry_line, () => {
                let els = getEntryInputElements(entry_line);
                let entries = [];
                let origNumberRows = els.entry_data.deb_accts.length + els.entry_data.cred_accts.length;
                for (let i = 0; i < els.deb_accts.length + els.cred_accts.length; i++) {
                    let entry = [
                        els.date.value,
                        els.entry_data.hasOwnProperty('rcrgindex') ? els.desc.value + 'RCRG' + els.entry_data.rcrgindex : els.desc.value
                    ];
                    if (i < els.deb_accts.length) {
                        entry.push(els.deb_accts[i].value);
                        entry.push(els.deb_amts[i].value);
                        entry.push('');
                    } else {
                        let j = i - els.deb_accts.length;
                        entry.push(els.cred_accts[j].value);
                        entry.push('');
                        entry.push(els.cred_amts[j].value);
                    }
                    entries.push(entry);
                }
                if (entries.length > origNumberRows) {
                    let rowsToAdd = entries.length - origNumberRows;
                    let startIndex = els.entry_data.start_sheet_index1 - 1 + origNumberRows;
                    let endIndex = startIndex + rowsToAdd;
                    insertRows('Journal', startIndex, endIndex)
                }
                if (entries.length < origNumberRows) {
                    let rowsToDelete = origNumberRows - entries.length;
                    let start = els.entry_data.start_sheet_index1 - 1 + origNumberRows - rowsToDelete;
                    let end = start + rowsToDelete;
                    deleteRows('Journal', start, end);
                }
                batchUpdateValues(
                    ['Journal!A' + els.entry_data.start_sheet_index1],
                    [entries],
                    function() {
                        bha_sync();
                        flash('Entry saved');
                        cancelEditEntry(entry_line);
                    }
                );
            });
        }
    });
}

function deleteEntry(entry_line) {
    isSignedIn(() => {
        doIfEntryStillSynced(entry_line, () => {
            const els = getEntryInputElements(entry_line);
            const origEntry = els.entry_data;
            flash(`Confirm to delete entry "${orig.desc}" from ${months[parseInt(orig.date.substring(5,7)) - 1]} ${parseInt(orig.date.substring(8))}, ${orig.date.substring(0,4)}?`, () => {
                let noRows = origEntry.deb_accts.length + origEntry.cred_accts.length;
                let startIndex = origEntry.start_sheet_index1 - 1; // deleteRows is index 0
                let endIndex = startIndex + noRows;
                deleteRows('Journal', startIndex, endIndex, () => {
                    journal.splice(startIndex - 1, noRows); // -1 for header row
                    entry_line.remove();
                    flash('Entry deleted.');
                });
            })
        })
    })
}

function mkRcrg(entry_line) {
    isSignedIn(() => {
        let els = getEntryInputElements(entry_line);
        let newIndex = getNewRcrgIndex(); // might be superfluous, we get the actual new one the moment we submit. Need to check if bug when removed.
        let template = {
            type: els.entry_data.hasOwnProperty('type') ? els.entry_data.type : '',
            index: newIndex,
            desc: els.desc.value,
            deb_accts: [],
            deb_amts: [],
            cred_accts: [],
            cred_amts: [],
        }
        for (let i = 0; i < els.deb_accts.length; i++) {
            template.deb_accts.push(els.deb_accts[i].value);
            template.deb_amts.push(els.deb_amts[i].value);
        }
        for (let i = 0; i < els.cred_accts.length; i++) {
            template.cred_accts.push(els.cred_accts[i].value);
            template.cred_amts.push(els.cred_amts[i].value);
        }
        let div = getRcrgLine(template);
        div.classList.add('popunder');
        let templateEls = getRcrgLineEls(div);
        templateEls.debLbl.classList.add('popunder');
        templateEls.credLbl.classList.add('popunder');
        templateEls.debits.classList.add('popunder');
        templateEls.credits.classList.add('popunder');
        editRcrg(div);
        templateEls.cancel.classList.remove('cancel_rcrg');
        templateEls.cancel.classList.add('cancel_new_entry');
        templateEls.cancel.style.display = 'inline';
        templateEls.edit.remove();
        templateEls.inst.remove();
        templateEls.delete.remove();
        templateEls.countdown.remove();
        templateEls.save.classList.remove('save_rcrg');
        templateEls.save.classList.add('submit_new_rcrg');
        templateEls.save.textContent = 'submit recurring entry template';
        templateEls.save.style.display = 'inline';
        entry_line.after(div);
    });
}

const journalClickHandler = function(e) {
    const entry_container = e.target.parentElement.parentElement;
    if (e.target.classList.contains('edit_entry')) {
        isSignedIn(() => { // checking here because we use the function when populating
            editEntry(entry_container);
        })
    } else if (e.target.classList.contains('cancel_entry')) {
        cancelEditEntry(entry_container);
    } else if (e.target.classList.contains('save_entry')) {
        saveEntry(entry_container);
    } else if (e.target.classList.contains('delete_entry')) {
        deleteEntry(entry_container);
    } else if (e.target.classList.contains('make_rcrg_entry')) {
        mkRcrg(entry_container);
    } else if (e.target.classList.contains('cancel_new_entry')) {
        entry_container.remove();
    }
}

// END Journal BEGIN Recurring Entries

function processRcrgs(raw, startingSSRowIndex1) {
    /* raw = [
        ['on/every', '#qty', 'period', 'desc', 'acct', 'debit', 'credit']
    ]
    /* returns [{
        type: exp/inc/tfr,
        index: int,
        rcrtype: on/every,
        qty: #,
        period: day/week/month/year,
        *days_since_last: int, *property present only if instance found in Journal
        *days_until_expected: int, *property present only if instance found in Journal
        desc: string,
        deb_accts: [string],
        deb_amts: [float],
        cred_accts: [string],
        cred_amts: [float],
        debits: float,
        credits: float,
        start_sheet_index1 = int,
    }]
    */
    function finalize(entry) {
        let isExp = true;
        let isInc = true;
        let isTfr = true;
        for (const acct of entry.deb_accts) {
            for (const row of accts) {
                if (row[0] == acct) {
                    if (row.length == 1 || (row.length > 1 && !row[1].includes('E'))) {
                        isExp = false;
                    }
                    if (row.length == 1 || (row.length > 1 && (!row[1].includes('A') && !row[1].includes['L']))) {
                        isInc = false;
                        isTfr = false;
                    }
                }
            }
        }
        for (const acct of entry.cred_accts) {
            for (const row of accts) {
                if (row[0] == acct) {
                    if (row.length == 1 || (row.length > 1 && !row[1].includes('R'))) {
                        isInc = false;
                    }
                    if (row.length == 1 || (row.length > 1 && (!row[1].includes('A') && !row[1].includes['L']))) {
                        isExp = false;
                        isTfr = false;
                    }
                }
            }
        }
        if (isExp === true && !isInc && !isTfr) {
            entry.type = 'exp';
        }
        if (!isExp && isInc === true && !isTfr) {
            entry.type = 'inc';
        }
        if (!isExp && !isInc && isTfr === true) {
            entry.type = 'tfr';
        }
        returned.push(entry);
    }
    ssIndex = parseInt(startingSSRowIndex1);
    let returned = [];
    let entry = {
        deb_accts: [],
        deb_amts: [],
        cred_accts: [],
        cred_amts: [],
        debits: 0,
        credits: 0,
    };
    if (ssIndex) entry.start_sheet_index1 = ssIndex;
    for (let i = 0; i < raw.length; i++) {
        const rcrtype = raw[i][0];
        const qty = parseInt(raw[i][1]);
        const period = raw[i][2];
        const desc = raw[i][3];
        const acct = raw[i][4];
        const debit = raw[i][5];
        const credit = raw[i][6];
        const index = parseInt(desc.substring(desc.indexOf('RCRG') + 4));
        const indexRE = new RegExp(`RCRG${index}$`);
        if (i > 0 && (rcrtype != entry.rcrtype || qty != entry.qty || period != entry.period || desc != entry.desc)) {
            finalize(entry);
            entry = {
                deb_accts: [],
                deb_amts: [],
                cred_accts: [],
                cred_amts: [],
                debits: 0,
                credits: 0,
            };
            if (ssIndex) entry.start_sheet_index1 = i + ssIndex;
        }
        entry.desc = desc;
        entry.index = index;
        entry.rcrtype = rcrtype;
        entry.qty = qty;
        entry.period = period;
        let lastYYYY;
        let lastMM;
        let lastDD;
        for (const jline of journal) {
            if (indexRE.test(jline[1])) {
                lastYYYY = parseInt(jline[0].substring(0,4));
                lastMM = parseInt(jline[0].substring(5,7));
                lastDD = parseInt(jline[0].substring(8));
            }
        }
        if (lastYYYY && lastMM && lastDD) {
            let lastDate = new Date(lastYYYY, lastMM - 1, lastDD);
            entry.days_since_last = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);
            entry.days_until_expected = getRcrgDaysUntilExpected(entry.rcrtype, entry.period, entry.qty, entry.days_since_last);
        }
        

        if (debit && (!credit || parseFloat(credit) === 0)) {
            entry.deb_accts.push(acct);
            entry.deb_amts.push(parseFloat(debit) ? parseFloat(debit) : parseFloat(debit) === 0 ? 0 : '');
            entry.debits += parseFloat(debit) ? parseFloat(debit) : 0;
            entry.debits = parseFloat(entry.debits.toFixed(2));
        }
        if ((!debit || parseFloat(debit) === 0) && credit) {
            entry.cred_accts.push(acct);
            entry.cred_amts.push(parseFloat(credit) ? parseFloat(credit) : parseFloat(credit) === 0 ? 0 : '');
            entry.credits += parseFloat(credit) ? parseFloat(credit) : 0;
            entry.credits = parseFloat(entry.credits.toFixed(2));
        }

        if (i == raw.length - 1) {
            finalize(entry);
        }
    }
    return returned;
}


function getRcrgDaysUntilExpected(rcrg_type, rcrg_period, rcrg_qty, days_since_last) {
    /*
    rcrg_type = on|every
    rcrg_period = day (can't if rcrg_type=='on')| week | month | year (can't if rcrg_type=='every')
    rcrg_qty = int
    days_since_last = int
    */
    rcrg_qty = parseInt(rcrg_qty);
    days_since_last = parseInt(days_since_last);
    let lastDate = new Date(today.getTime() - (days_since_last * 24 * 60 * 60 * 1000));
    let expectDate;
    if (rcrg_type == 'every') {
        if (rcrg_period == 'day') {
            expectDate = new Date(lastDate.getTime() + (rcrg_qty * 24 * 60 * 60 * 1000));
        } else if (rcrg_period == 'week') {
            expectDate = new Date(lastDate.getTime() + (rcrg_qty * 7 * 24 * 60 * 60 * 1000));
        } else if (rcrg_period == 'month') {
            const lastDateYear = lastDate.getDate() < 28  ? lastDate.getFullYear() : lastDate.getFullYear() + Math.floor((lastDate.getMonth() + 1)/12);
            const lastDateMonth = lastDate.getDate() < 28 ? lastDate.getMonth() : (lastDate.getMonth() + 1)%12;
            let daysToAdd = 0;
            for (let i = 0; i < rcrg_qty; i++) {
                const y = lastDateYear + Math.floor((lastDateMonth + i)/12)
                const m = (lastDateMonth + i)%12;
                daysToAdd += getDaysInMonth(m, y);
            }
            expectDate = new Date(lastDate.getTime() + (daysToAdd * 86400000));
        }
    } else if (rcrg_type == 'on') {
        if (rcrg_period == 'week') {
            let lastPlusOnePeriod = new Date(lastDate.getTime() + (7 * 24 * 60 * 60 * 1000));
            let daysIntoExpectedPeriod = lastPlusOnePeriod.getDay();
            let beginExpectedPeriod = new Date(lastPlusOnePeriod.getTime() - (daysIntoExpectedPeriod * 24 * 60 * 60 * 1000));
            expectDate = new Date(beginExpectedPeriod.getTime() + (rcrg_qty * 24 * 60 * 60 * 1000));
        } else if (rcrg_period == 'month') {
            const lastDateYear = lastDate.getDate() < 28  ? lastDate.getFullYear() : lastDate.getFullYear() + Math.floor((lastDate.getMonth() + 1)/12);
            const lastDateMonth = lastDate.getDate() < 28 ? lastDate.getMonth() : (lastDate.getMonth() + 1)%12;
            let lastPlusOnePeriod = new Date(lastDate.getTime() + (getDaysInMonth(lastDateMonth, lastDateYear) * 86400000));
            expectDate = new Date(lastPlusOnePeriod.getTime() - (lastPlusOnePeriod.getDate() * 86400000) + (rcrg_qty * 86400000));
        } else if (rcrg_period == 'year') {
            let lastPlusOnePeriod = new Date(lastDate.getFullYear() + 1, lastDate.getMonth(), lastDate.getDate());
            expectDate = new Date(lastPlusOnePeriod.getFullYear(), 0, rcrg_qty) 
        }
    }
    return Math.floor((expectDate.getTime() - today.getTime()) / 86400000);
}

function initializeRcrg() {
    let create_rcrg_btn = document.createElement('button');
    create_rcrg_btn.textContent = 'New recurring entry';
    create_rcrg_btn.onclick = function() {
        createRcrg('exp');
    }
    document.getElementById('navbar_buttons').append(create_rcrg_btn);
    populateRcrg();
}

function populateRcrg() {
    while (document.getElementById('rcrg').firstChild) {
        document.getElementById('rcrg').firstChild.remove();
    }
    let rcrgList = rcrgs.length > 0 ? processRcrgs(rcrgs, 2) : [];

    for (let i = 0; i < rcrgList.length; i++) {
        let indexOfSmallestValue = i;
        for (let j = i + 1; j < rcrgList.length; j++) {
            if (!rcrgList[indexOfSmallestValue].hasOwnProperty('days_until_expected') || (rcrgList[j].hasOwnProperty('days_until_expected') && (rcrgList[j].days_until_expected < rcrgList[indexOfSmallestValue].days_until_expected))) {
                indexOfSmallestValue = j;
            }
        }
        if (indexOfSmallestValue != i) {
            let lesser = rcrgList[indexOfSmallestValue];
            rcrgList[indexOfSmallestValue] = rcrgList[i];
            rcrgList[i] = lesser;
        }
    }

    for (const entry of rcrgList) {
        // let line = getEntryInputLine(entry);
        let line = getRcrgLine(entry);
        document.getElementById('rcrg').append(line);
    }
}

function getRcrgLine(e) {
    /* e = {
        type: exp/inc/tfr,
        index: int,
        rcrtype: on/every,
        qty: #,
        period: day/week/month/year,
        days_since_last: int, *property present only if instance found in Journal
        days_until_expected: int, *property present only if instance found in Journal
        desc: string,
        deb_accts: [string],
        deb_amts: [float],
        cred_accts: [string],
        cred_amts: [float],
        debits: float,
        credits: float,
        start_sheet_index1 = int,
    } */
    let typeVal = e.hasOwnProperty('type') ? e.type : '';
    let deb_acctsVal = e.hasOwnProperty('deb_accts') ? e.deb_accts : [];
    let deb_amtsVal = e.hasOwnProperty('deb_amts') ? e.deb_amts : [];
    let cred_acctsVal = e.hasOwnProperty('cred_accts') ? e.cred_accts : [];
    let cred_amtsVal = e.hasOwnProperty('cred_amts') ? e.cred_amts : [];

    let entry = mkc('entry');
    entry.classList.add('rcrg_template');
    entry.dataset.origentry = JSON.stringify(e);

    let typebox = mkc('type_container');
    let exp_btn = mkc('exp_btn', 'button');
    exp_btn.textContent = 'expense';
    exp_btn.tabIndex = -1;
    exp_btn.disabled = true;
    let inc_btn = mkc('inc_btn', 'button');
    inc_btn.textContent = 'income';
    inc_btn.tabIndex = -1;
    inc_btn.disabled = true;
    let tfr_btn = mkc('tfr_btn', 'button');
    tfr_btn.textContent = 'transfer';
    tfr_btn.tabIndex = -1;
    tfr_btn.disabled = true;
    let gen_btn = mkc('gen_btn', 'button');
    gen_btn.textContent = 'general';
    gen_btn.tabIndex = -1;
    gen_btn.disabled = true;
    if (typeVal == 'exp') {
        exp_btn.classList.add('active_type');
    } else if (typeVal == 'inc') {
        inc_btn.classList.add('active_type');
    } else if (typeVal == 'tfr') {
        tfr_btn.classList.add('active_type');
    } else if (typeVal == '') {
        gen_btn.classList.add('active_type');
    }
    let split_btn  = mkc('split_entry', 'button');
    split_btn.textContent = 'split';
    split_btn.tabIndex = -1;
    split_btn.disabled = true;
    let add_deb = mkc('add_deb_acct', 'button');
    add_deb.textContent = 'add debit';
    add_deb.tabIndex = -1;
    add_deb.disabled = true;
    add_deb.style.display = 'none';
    let add_cred = mkc('add_cred_acct', 'button');
    add_cred.textContent = 'add credit';
    add_cred.tabIndex = -1;
    add_cred.disabled = true;
    add_cred.style.display = 'none';
    typebox.append(exp_btn, inc_btn, tfr_btn, gen_btn, split_btn, add_deb, add_cred);

    let details = mkc('details');

    let desc = mkc('desc','input');
    desc.name = 'desc';
    desc.placeholder = 'description';
    desc.disabled = true;
    desc.value = e.hasOwnProperty('desc') ? e.desc.includes('RCRG') ? e.desc.substring(0, e.desc.indexOf('RCRG')) : e.desc : '';
    details.append(desc);

    let rcrg_details = mkc('rcrg_details');

    let s1 = document.createElement('span');
    s1.textContent = 'Recurring no. ';
    s1.style.display = 'none';

    let rcrg_index = mkc('rcrg_index', 'input');
    rcrg_index.type = 'number';
    rcrg_index.min = '0';
    rcrg_index.max = '999';
    rcrg_index.step = '1';
    rcrg_index.disabled = true;
    rcrg_index.value = e.index;
    rcrg_index.style.display = 'none';

    let s2 = document.createElement('span');
    s2.textContent = "recurs "

    let rcrg_type = mkc('rcrg_type', 'select');
    rcrg_type.disabled = true;
    let every_opt = document.createElement('option');
    every_opt.textContent = 'every';
    every_opt.value = 'every';
    every_opt.selected = e.rcrtype == 'every';
    let on_opt = document.createElement('option');
    on_opt.textContent = 'on';
    on_opt.value = 'on';
    on_opt.selected = !e.hasOwnProperty('rcrtype') || e.rcrtype == 'on';
    rcrg_type.append(every_opt, on_opt);

    let on_text_1 = mkc('rcrg_on_text_1', 'span');
    on_text_1.textContent = ' the ';
    on_text_1.style.display = !e.hasOwnProperty('rcrtype') || e.rcrtype == 'on' ? 'inline' : 'none';

    let rcrg_qty = mkc('rcrg_qty', 'input');
    rcrg_qty.type = 'number';
    rcrg_qty.min = '0';
    rcrg_qty.max = '365';
    rcrg_qty.step = '1';
    rcrg_qty.disabled = true;
    rcrg_qty.value = e.hasOwnProperty('qty') ? e.qty : '';

    let on_text_2 = mkc('rcrg_on_text_2', 'span');
    if (e.hasOwnProperty('qty')) {
        const last = e.qty.toString().substring(e.qty.toString().length - 1);
        let penult = e.qty.toString().length > 1 ? e.qty.toString().substring(e.qty.toString().length - 2, e.qty.toString().length - 1) : '';

        if (last == '1' && penult != '1') {
            on_text_2.textContent = 'st day of every';
        } else if (last == '2' && penult != '1') {
            on_text_2.textContent = 'nd day of every';
        } else if (last == '3' && penult != '1') {
            on_text_2.textContent = 'rd day of every';
        } else {
            on_text_2.textContent = 'th day of every';
        }
    } else {
        on_text_2.textContent = 'day of every';
    }
    on_text_2.style.display = !e.hasOwnProperty('rcrtype') || e.rcrtype == 'on' ? 'inline' : 'none';

    let rcrg_period = mkc('rcrg_period', 'select');
    rcrg_period.disabled = true;
    if (e.hasOwnProperty('rcrtype') && e.rcrtype == 'every') {
        let day_opt = document.createElement('option');
        day_opt.textContent = 'days';
        day_opt.value = 'day';
        let week_opt = document.createElement('option');
        week_opt.textContent = 'weeks';
        week_opt.value = 'week';
        let month_opt = document.createElement('option');
        month_opt.textContent = 'months';
        month_opt.value = 'month';
        rcrg_period.append(day_opt, week_opt, month_opt);
    } else {
        let week_opt = document.createElement('option');
        week_opt.textContent = 'week';
        week_opt.value = 'week';
        let month_opt = document.createElement('option');
        month_opt.textContent = 'month';
        month_opt.value = 'month';
        let year_opt = document.createElement('option');
        year_opt.textContent = 'year';
        year_opt.value = 'year';
        rcrg_period.append(week_opt, month_opt, year_opt);
    }
    rcrg_period.value = e.hasOwnProperty('period') ? e.period : '';
    rcrg_details.append(s1, rcrg_index, s2, rcrg_type, on_text_1, rcrg_qty, on_text_2, rcrg_period);

    let deb_accts = mkc('deb_accts');

    const debs_header = mkc('entry_accts_header');
    const deb_lbl_wrap = mkc('side_label_wrap');
    const deb_lbl = mkc('debit_label', 'span');
    deb_lbl.textContent = 'debits:';
    deb_lbl_wrap.append(deb_lbl);
    const debs_wrap = mkc('deb_wrap');
    const debs = mkc('entry_debits', 'span');
    debs.textContent = '$' + insertCommas(e.debits);
    debs.style.display = deb_acctsVal.length > 1 ? 'inline' : 'none';
    debs_wrap.append(debs);
    debs_header.append(deb_lbl_wrap, debs_wrap);
    deb_accts.append(debs_header);

    if (deb_acctsVal.length == 0) {
        let div = getEntryAcct({side: 'deb', type: typeVal})
        deb_accts.append(div);
        deb_acctsVal.push('');
    } else {
        for (let i = 0; i < deb_acctsVal.length; i++) {
            let div = getEntryAcct({
                side: 'deb',
                type: typeVal,
                acct_name: deb_acctsVal[i],
                amt: deb_amtsVal[i],
            })
            deb_accts.append(div);
        }
    }
    
    let cred_accts = mkc('cred_accts');

    const creds_header = mkc('entry_accts_header');
    const cred_lbl_wrap = mkc('side_label_wrap');
    const cred_lbl = mkc('credit_label', 'span');
    cred_lbl.textContent = 'credits:';
    cred_lbl_wrap.append(cred_lbl);
    const creds_wrap = mkc('cred_wrap');
    const creds = mkc('entry_credits', 'span');
    creds.textContent = '$' + insertCommas(e.credits);
    creds.style.display = cred_acctsVal.length > 1 ? 'inline' : 'none';
    creds_wrap.append(creds);
    creds_header.append(cred_lbl_wrap, creds_wrap);
    cred_accts.append(creds_header);

    if (cred_acctsVal.length == 0) {
        let div = getEntryAcct({side: 'cred', type: typeVal})
        cred_accts.append(div);
        cred_acctsVal.push('');
    } else {
        for (let i = 0; i < cred_acctsVal.length; i++) {
            let div = getEntryAcct({
                side:'cred',
                type: typeVal,
                acct_name: cred_acctsVal[i],
                amt: cred_amtsVal[i],
            })
            cred_accts.append(div);
        }
    }
    let summary_div = mkc('entry_summary');
    let edit_btn = mkc('edit_rcrg', 'button');
    edit_btn.textContent = 'edit';
    let cancel_btn = mkc('cancel_rcrg', 'button');
    cancel_btn.textContent = 'cancel';
    cancel_btn.style.display = 'none';
    let save_btn = mkc('save_rcrg', 'button');
    save_btn.textContent = 'save';
    save_btn.style.display = 'none';
    let delete_btn = mkc('delete_rcrg', 'button');
    delete_btn.textContent = 'delete';
    delete_btn.style.display = 'none';
    let inst_btn = mkc('inst_rcrg', 'button');
    inst_btn.textContent = 'create entry';
    let countdown = mkc('rcrg_template_countdown');
    let expectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (e.hasOwnProperty('days_until_expected') ? e.days_until_expected : 0));
    countdown.textContent = `next on: ${mos[expectedDate.getMonth()]} ${expectedDate.getDate()}, ${expectedDate.getFullYear()}`;
    if (e.hasOwnProperty('days_until_expected')) {
        countdown.style.display = 'block';
        if (e.days_until_expected < 5) {
            if (e.days_until_expected < 0) {
                countdown.classList.add('rcrg_overdue');
            } else {
                countdown.classList.add('rcrg_upcoming');
            }
        }
    } else {
        countdown.style.display = 'none';
    }
    summary_div.append(edit_btn, cancel_btn, save_btn, delete_btn, inst_btn, countdown);

    entry.append(details, typebox, rcrg_details, deb_accts, cred_accts, summary_div);
    let els = getRcrgLineEls(entry);
    showHideEntryAcctBtns(els);
    return entry;
}

function getRcrgLineEls(line) {
    /* returns {
        entry_data: rcrgTemplateObj,
        desc:,
        exp:,
        inc:,
        tfr:,
        gen:,
        split:,
        add_deb:,
        add_cred:,
        deb_accts: [],
        rem_deb_acct_btns: [],
        deb_amts: [],
        cred_accts: [],
        rem_cred_acct_btns: [],
        cred_amts: [],
        on_opts: [...],
        every_opts: [...],
        index:,
        rcrtype:,
        onlbl1:,
        qty:,
        onlbl2:,
        period:,
        submit:,
        edit:,
        cancel:,
        save:,
        delete:,
        inst:,
        countdown:,
    } */
    let on_week_opt = document.createElement('option');
    on_week_opt.textContent = 'week';
    on_week_opt.value = 'week';
    let on_month_opt = document.createElement('option');
    on_month_opt.textContent = 'month';
    on_month_opt.value = 'month';
    let year_opt = document.createElement('option');
    year_opt.textContent = 'year';
    year_opt.value = 'year';

    let day_opt = document.createElement('option');
    day_opt.textContent = 'days';
    day_opt.value = 'day';
    let every_week_opt = document.createElement('option');
    every_week_opt.textContent = 'weeks';
    every_week_opt.value = 'week';
    let every_month_opt = document.createElement('option');
    every_month_opt.textContent = 'months';
    every_month_opt.value = 'month';

    function checkChildren(parent) {
        for (const el of parent.children) {
            if (el.classList.contains('rcrg_index'))     els.index = el;
            if (el.classList.contains('rcrg_type'))      els.rcrtype = el;
            if (el.classList.contains('rcrg_on_text_1')) els.onlbl1 = el;
            if (el.classList.contains('rcrg_qty'))       els.qty = el;
            if (el.classList.contains('rcrg_on_text_2')) els.onlbl2 = el;
            if (el.classList.contains('rcrg_period'))    els.period = el;
            if (el.classList.contains('submit_new_rcrg')) els.submit = el;
            if (el.classList.contains('edit_rcrg'))      els.edit = el;
            if (el.classList.contains('cancel_rcrg'))    els.cancel = el;
            if (el.classList.contains('save_rcrg'))      els.save = el;
            if (el.classList.contains('delete_rcrg'))    els.delete = el;
            if (el.classList.contains('inst_rcrg'))      els.inst = el;
            if (el.classList.contains('rcrg_template_countdown')) els.countdown = el;

            if (el.children) checkChildren(el);
        }
    }

    let els = getEntryInputElements(line);
    els.on_opts = [on_week_opt, on_month_opt, year_opt];
    els.every_opts = [day_opt, every_week_opt, every_month_opt];

    checkChildren(line);

    return els;
}

function validateRcrgLine(line, quiet) {
    let errors = [];
    let els = getRcrgLineEls(line);
    if (!els.rcrtype.value) {
        errors.push('Recurring type is required.');
    }
    if (!els.qty.value) {
        errors.push('Recurring interval is required.');
    }
    if (!els.period.value) {
        errors.push('Recurring interval period is required.');
    }
    let atLeastOneAcct;
    for (const el of els.deb_accts) {
        if (el.value) atLeastOneAcct = el.value;
    }
    for (const el of els.cred_accts) {
        if (el.value) atLeastOneAcct = el.value;
    }
    if (!atLeastOneAcct) {
        errors.push('Recurring template must specify at least one account to debit or credit.');
    }

    subValidateDesc(els.desc, errors, quiet);
    //subValidateEntryAmts(els, errors, quiet);
    entryAmtAutoComplete(els);
    showHideEntryAcctBtns(els);
    
    if (errors.length > 0 && !quiet) {
        let text = '';
        for (const error of errors) {
            text += error + ' ';
        }
        flash(text);
        return false;
    } else if (errors.length == 0) {
        return true;
    }
}

function updateRcrgOnText(rcrg_template_container) {
    let els = getRcrgLineEls(rcrg_template_container);
    if (els.rcrtype.value != 'every') {
        let last = els.qty.value ? els.qty.value.toString().substring(els.qty.value.toString().length - 1) : '';
        let penult = els.qty.value.toString().length > 1 ? els.qty.value.toString().substring(els.qty.value.toString().length - 2, els.qty.value.toString().length - 1) : '';
        if (last) {
            if (last == '1' && penult != '1') {
                els.onlbl2.textContent = 'st day of every';
            } else if (last == '2' && penult != '1') {
                els.onlbl2.textContent = 'nd day of every';
            } else if (last == '3' && penult != '1') {
                els.onlbl2.textContent = 'rd day of every';
            } else {
                els.onlbl2.textContent = 'th day of every';
            }
        } else {
            els.onlbl2.textContent = 'day of every';
        }
    }
}

function rcrgTypeChanged(rcrg_line) {
    let els = getRcrgLineEls(rcrg_line);
    if (els.rcrtype.value == 'every') {
        els.onlbl1.style.display = 'none';
        els.onlbl2.style.display = 'none';
        while (els.period.firstChild) {
            els.period.firstChild.remove();
        }
        for (const option of els.every_opts) {
            els.period.append(option);
        }
    } else {
        updateRcrgOnText(rcrg_line);
        els.onlbl1.style.display = 'inline';
        els.onlbl2.style.display = 'inline';
        while (els.period.firstChild) {
            els.period.firstChild.remove();
        }
        for (const option of els.on_opts) {
            els.period.append(option);
        }
    }
}

function getNewRcrgIndex() {
    let newIndex = 0;
    for (const row of rcrgs) {
        let rowIndex = parseInt(row[3].substring(row[3].indexOf('RCRG') + 4));
        if (rowIndex >= newIndex) {
            newIndex = rowIndex + 1;
        }
    }
    return newIndex;
}

function createRcrg(type) {
    isSignedIn(() => {
        let newIndex = getNewRcrgIndex();  // might be superfluous, we get the actual new one the moment we submit. Need to check if bug when removed.
        let div = getRcrgLine({
            type: type,
            index: newIndex
        });
        div.classList.add('popunder');
        let els = getRcrgLineEls(div);
        els.debLbl.classList.add('popunder');
        els.credLbl.classList.add('popunder');
        els.debits.classList.add('popunder');
        els.credits.classList.add('popunder');
        editRcrg(div);
        els.cancel.classList.remove('cancel_rcrg');
        els.cancel.classList.add('cancel_new_entry');
        els.save.classList.remove('save_rcrg');
        els.save.classList.add('submit_new_rcrg');
        els.save.textContent = 'Submit new recurring entry'
        els.edit.remove();
        els.delete.remove();
        els.inst.remove();
        els.countdown.remove();
        const target = document.getElementById('rcrg');
        if (target.firstChild) {
            target.firstChild.before(div);
        } else {
            target.append(div);
        }
    });
}

async function submitNewRcrg(rcrg_line) {
    isSignedIn(async () => {
        if (validateRcrgLine(rcrg_line, false)) {
            let rcrgs_response;
            try {
                rcrgs_response = await gapi.client.sheets.spreadsheets.values.batchGet({
                    spreadsheetId: ssid,
                    ranges: ['Recurring Entries!A1:G']
                });
            } catch(err) {
                flash('Error' + err.toString());
                throw err;
            }
            rcrgs = rcrgs_response.result.valueRanges[0].values; // update rcrgs before getting a new index

            let index = getNewRcrgIndex();
            let els = getRcrgLineEls(rcrg_line);
            let type = els.rcrtype.value;
            let qty = els.qty.value;
            let period = els.period.value;
            let desc = els.desc.value + ' RCRG' + index;
            
            let entries = [];
            for (let i = 0; i < els.deb_accts.length + els.cred_accts.length; i++) {
                let entry = [];
                entry.push(type);
                entry.push(qty);
                entry.push(period);
                entry.push(desc);
                if (i < els.deb_accts.length) {
                    entry.push(els.deb_accts[i].value);
                    entry.push(els.deb_amts[i].value ? els.deb_amts[i].value : 'Y');
                    entry.push('');
                } else {
                    let j = i - els.deb_accts.length;
                    entry.push(els.cred_accts[j].value);
                    entry.push('');
                    entry.push(els.cred_amts[j].value ? els.cred_amts[j].value : 'Y');
                }
                entries.push(entry);
            }
            appendValues(ssid, 'Recurring Entries!A1', 'RAW', entries, async function() {
                await bha_sync();
                flash('Recurring template saved');
                rcrg_line.remove()
                populateRcrg();
            });
        }
    })
}

async function doIfRcrgStillSynced(rcrg_line, callback) { // calling function will have already checked if we're signed in
    const localOrigEntry = getEntryInputElements(rcrg_line).entry_data;
    const start_row = localOrigEntry.start_sheet_index1;
    const end_row = start_row - 1 + localOrigEntry.deb_accts.length + localOrigEntry.cred_accts.length;
    let database_response;
    try {
        database_response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: ssid,
            ranges: [`Recurring Entries!A${start_row}:G${end_row + 1}`] // we are pulling one extra line. Pulling only the number of accounts from the local entry would not find out if the live entry has gained one or more additional accounts. However, if we pull one more row and it has the same rcrtype, qty, period, and desc, the total number of accounts won't match in the processed entries below. If the entries are still synced, the extra row is ignored by only looking at the first processed entry below.
        });
    } catch(err) {
        flash('Error');
        throw err;
    }
    let entryOnLiveDB = processRcrgs(database_response.result.valueRanges[0].values)[0];
    if (localOrigEntry.rcrtype == entryOnLiveDB.rcrtype && localOrigEntry.qty == entryOnLiveDB.qty && localOrigEntry.period == entryOnLiveDB.period && localOrigEntry.desc == entryOnLiveDB.desc && localOrigEntry.deb_accts.length == entryOnLiveDB.deb_accts.length && localOrigEntry.cred_accts.length == entryOnLiveDB.cred_accts.length) {
        callback();
    } else {
        flash('Spreadsheet has become unsynced. Please try again.');
        await bha_sync();
        rcrg_line.remove();
        populateRcrg();
    }
}

function editRcrg(rcrg_line) {
    isSignedIn(() => {
        let els = getRcrgLineEls(rcrg_line);
        els.rcrtype.disabled = false;
        els.qty.disabled = false;
        els.period.disabled = false;
        els.desc.disabled = false;
        els.exp.disabled = false;
        els.inc.disabled = false;
        els.tfr.disabled = false;
        els.gen.disabled = false;
        els.split.disabled = false;
        els.add_deb.disabled = false;
        els.add_cred.disabled = false;
        els.edit.style.display = 'none';
        els.save.style.display = 'inline';
        els.cancel.style.display = 'inline';
        els.delete.style.display = 'inline';
        for (let i = 0; i < els.deb_accts.length; i++) {
            els.deb_accts[i].disabled = false;
            els.rem_deb_acct_btns[i].disabled = false;
            els.deb_amts[i].disabled = false;
        }
        for (let i = 0; i < els.cred_accts.length; i++) {
            els.cred_accts[i].disabled = false;
            els.rem_cred_acct_btns[i].disabled = false;
            els.cred_amts[i].disabled = false;
        }
        entryAmtAutoComplete(els); // in case it was last edited missing an amount
    })
}

function cancelRcrg(rcrg_line) {
    let els = getRcrgLineEls(rcrg_line);
    els.rcrtype.disabled = true;
    els.qty.disabled = true;
    els.period.disabled = true;
    els.desc.disabled = true;
    els.exp.disabled = true;
    els.inc.disabled = true;
    els.tfr.disabled = true;
    els.gen.disabled = true;
    els.split.disabled = true;
    els.add_deb.disabled = true;
    els.add_cred.disabled = true;
    els.edit.style.display = 'inline';
    els.save.style.display = 'none';
    els.cancel.style.display = 'none';
    els.delete.style.display = 'none';
    for (let i = 0; i < els.deb_accts.length; i++) {
        els.deb_accts[i].disabled = true;
        els.rem_deb_acct_btns[i].disabled = true;
        els.deb_amts[i].disabled = true;
    }
    for (let i = 0; i < els.cred_accts.length; i++) {
        els.cred_accts[i].disabled = true;
        els.rem_cred_acct_btns[i].disabled = true;
        els.cred_amts[i].disabled = true;
    }
}

async function saveRcrg(rcrg_line) { 
    isSignedIn(async () => {
        if (validateRcrgLine(rcrg_line)) {
            doIfRcrgStillSynced(rcrg_line, async () => {
                let els = getRcrgLineEls(rcrg_line);
                let entries = [];
                let origNumberRows = els.entry_data.deb_accts.length + els.entry_data.cred_accts.length;
                for (let i = 0; i < els.deb_accts.length + els.cred_accts.length; i++) {
                    let entry = [
                        els.rcrtype.value,
                        els.qty.value,
                        els.period.value,
                        els.desc.value + 'RCRG' + els.entry_data.index
                    ];
                    if (i < els.deb_accts.length) {
                        entry.push(els.deb_accts[i].value);
                        entry.push(els.deb_amts[i].value);
                        entry.push('');
                    } else {
                        let j = i - els.deb_accts.length;
                        entry.push(els.cred_accts[j].value);
                        entry.push('');
                        entry.push(els.cred_amts[j].value);
                    }
                    entries.push(entry);
                }
                if (entries.length > origNumberRows) {
                    let rowsToAdd = entries.length - origNumberRows;
                    let startIndex = els.entry_data.start_sheet_index1 - 1 + origNumberRows;
                    let endIndex = startIndex + rowsToAdd;
                    try {
                        await insertRows('Recurring Entries', startIndex, endIndex);
                    } catch(err) {
                        flash(err.message);
                        throw err;
                    }
                } else if (entries.length < origNumberRows) {
                    let rowsToDelete = origNumberRows - entries.length;
                    const startIndex = els.entry_data.start_sheet_index1 - 1 + origNumberRows - rowsToDelete;
                    const endIndex = startIndex + rowsToDelete;
                    try {
                        await deleteRows('Recurring Entries', startIndex, endIndex);
                    } catch(err) {
                        flash(err.message);
                        throw err;
                    }
                }
                batchUpdateValues(
                    [`Recurring Entries!A${els.entry_data.start_sheet_index1}`],
                    [entries],
                    async function() {
                        await bha_sync();
                        flash('Recurring template saved');
                        rcrg_line.remove();
                        populateRcrg();
                    }
                );

            });
        }
    })
}

function deleteRcrg(rcrg_line) {
    isSignedIn(() => {
        doIfRcrgStillSynced(rcrg_line, async () => {
            let confirmMsg = 'Are you sure?';

            let origEntry = JSON.parse(rcrg_line.dataset.origentry);
            let no_entries = 0;
            let indexRE = new RegExp(`RCRG${origEntry.index}$`);
            for (const row of journal) if (indexRE.test(row[1])) no_entries++;
            if (no_entries > 0) confirmMsg += ` This will also remove the recurring flag from ${no_entries} journal entries`;
            
            flash(confirmMsg, () => {
                let noRows = origEntry.deb_accts.length + origEntry.cred_accts.length;
                let startIndex = origEntry.start_sheet_index1 - 1; // deleteRows is index 0
                let endIndex = startIndex + noRows;
                let removeRcrgIndexFlags = async function() {
                    let flashMessage = 'Entry deleted.'
                    let ranges = [];
                    let values = [];
                    let indexRE = new RegExp(`RCRG${origEntry.index}$`);
                    for (let i = 0; i < journal.length; i++) {
                        let row = journal[i];
                        if (indexRE.test(row[1])) {
                            ranges.push(`Journal!B${i + 2}`);
                            let desc = row[1].substring(0,row[1].indexOf('RCRG'));
                            values.push([[desc]]);
                        }
                    }
                    batchUpdateValues(ranges, values, function() {
                        flashMessage += ` Recurring flag removed from ${ranges.length} journal rows.`;
                        rcrg_line.remove();
                        bha_sync();
                        flash(flashMessage);
                    })

                }
                deleteRows('Recurring Entries', startIndex, endIndex, removeRcrgIndexFlags);
            });
        });
    })
}

function instRcrgEntry(rcrg_line) {
    let els = getRcrgLineEls(rcrg_line);
    let template = {
        type: els.entry_data.hasOwnProperty('type') ? els.entry_data.type : '',
        rcrgindex: els.entry_data.index,
        desc: els.desc.value,
        deb_accts: [],
        deb_amts: [],
        cred_accts: [],
        cred_amts: [],
    }
    if (els.entry_data.hasOwnProperty('days_until_expected')) {
        let expectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (els.entry_data.hasOwnProperty('days_until_expected') ? els.entry_data.days_until_expected : 0));
        template.date = `${expectedDate.getFullYear()}-${(expectedDate.getMonth() + 1).toString().padStart(2, '0')}-${expectedDate.getDate().toString().padStart(2, '0')}`;
    }
    for (let i = 0; i < els.deb_accts.length; i++) {
        template.deb_accts.push(els.deb_accts[i].value);
        template.deb_amts.push(els.deb_amts[i].value);
    }
    for (let i = 0; i < els.cred_accts.length; i++) {
        template.cred_accts.push(els.cred_accts[i].value);
        template.cred_amts.push(els.cred_amts[i].value);
    }
    let div = getEntryInputLine(template);
    div.classList.add('popunder');
    let dels = getEntryInputElements(div);
    dels.debLbl.classList.add('popunder');
    dels.credLbl.classList.add('popunder');
    dels.debits.classList.add('popunder');
    dels.credits.classList.add('popunder');
    dels.cancel.classList.remove('cancel_entry');
    dels.cancel.classList.add('cancel_new_entry');
    dels.cancel.style.display = 'inline';
    dels.edit.remove();
    dels.save.classList.remove('save_entry');
    dels.save.classList.add('submit_entry');
    dels.save.textContent = 'submit';
    dels.save.style.display = 'inline';
    editEntry(div);
    rcrg_line.after(div);
}

let rcrgClickHandler = function(e) {
    let rcrg_line = e.target.parentElement.parentElement;
    if (e.target.classList.contains('submit_new_rcrg')) {
        submitNewRcrg(rcrg_line);
    } else if (e.target.classList.contains('edit_rcrg')) {
        editRcrg(rcrg_line);
    } else if (e.target.classList.contains('cancel_rcrg')) {
        cancelRcrg(rcrg_line);
    } else if (e.target.classList.contains('save_rcrg')) {
        saveRcrg(rcrg_line);
    } else if (e.target.classList.contains('delete_rcrg')) {
        deleteRcrg(rcrg_line);
    } else if (e.target.classList.contains('inst_rcrg')) {
        instRcrgEntry(rcrg_line);
    }
}

let rcrgChangeHandler = function(e) {
    if (e.target.classList.contains('rcrg_type')) {
        let rcrg_line = e.target.parentElement.parentElement;
        rcrgTypeChanged(rcrg_line);
    } else if (e.target.classList.contains('rcrg_qty')) {
        let rcrg_line = e.target.parentElement.parentElement;
        updateRcrgOnText(rcrg_line);
    }
}

// END Recurring Entries // BEGIN Edit Accounts 

function getNestedAccts(typecode) {
    // accts without any typecodes (i.e., nothing in 'Account List!B#') will not be incorporated into the returned list
    typecode = typecode ? typecode : '';
    let accountUsedInJournal = {};
    for (const a of accts) {
        if (a.length == 0 || (a.length > 1 && a[1].includes(typecode))) {
            accountUsedInJournal[a[0]] = false;
        }
    }
    if (journal && journal.length > 0) {
        for (const row of journal) {
            if (accountUsedInJournal.hasOwnProperty(row[2])) {
                accountUsedInJournal[row[2]] = true;
            }
        }
    }
    let list = [];
    function addToList(acct, parentList) {
        for (let i = 0; i < parentList.length; i++) {
            if (acct.parent == parentList[i].name) {
                parentList[i].subs.push(acct);
                break;
            } else if (parentList[i].subs.length > 0) {
                addToList(acct, parentList[i].subs);
            }
        }
    }
    for (const a of accts) {
        if (a[0] == 'Assets' && (!typecode || typecode == 'A')) {
            list.push({name: 'Assets', subs: []});
        } else if (a[0] == 'Liabilities' && (!typecode || typecode == 'A')) {
            list.push({name: 'Liabilities', subs: []});
        } else if (a[0] == 'Equity' && (!typecode || typecode == 'Q')) {
            list.push({name: 'Equity', subs: []});
        } else if (a[0] == 'Revenue' && (!typecode || typecode == 'R' )) {
            list.push({name: 'Revenue', subs: []});
        } else if (a[0] == 'Expenses' && (!typecode || typecode == 'E')) {
            list.push({name: 'Expenses', subs: []});
        } else if (a.length > 1 && a[1].includes(typecode)) {
            let acct = {
                name: a[0],
                typecodes: a[1],
                parent: a[2],
                budget: a[3],
                subs: [],
                usedInJournal: accountUsedInJournal[a[0]],
            }
            addToList(acct, list);
        }
    }
    return list;
}

function getListOfAllSubAccts(acct_name) {
    let subAccts = [];
    function checkForSubs(parent_name) {
        for (const a of accts) {
            if (a[2] == parent_name) {
                subAccts.push(a[0]);
                let newParent = a[0];
                checkForSubs(newParent);
            }
        }
    }
    checkForSubs(acct_name);
    return subAccts;
}

function getEditAcctLine(acct) {
    /* 
    acct = {
        name: raw[0],
        typecodes: raw[1],
        parent: raw[2],
        budget: raw[3],
        subs: [{}],
    }
    returns div.edit_acct_line
    */
    let div = mkc('ea_line');
    // dataset: parent, budget, name, typecodes
    div.dataset.orig = JSON.stringify({
        name: acct.name,
        typecodes: acct.typecodes,
        parent: acct.parent ? acct.parent : '',
        budget: acct.budget ? acct.budget : '',
    })
    let name_and_buttons = mkc('ea_name_and_controls');
    let arrow = mkc('ea_arrow');
    if (acct.subs.length == 0) {
        arrow.textContent = ' ';
    } else {
        arrow.textContent = '\u21A7';
    }
    let name = mkc('ea_name', 'input');
    name.value = acct.name;
    name.placeholder = "account name";
    name.name = "edit_acct_name";
    name.size = acct.name.length > 20 ? acct.name.length : 20;
    name.maxLength = '30';
    name.disabled = true;
    name_and_buttons.append(arrow, name);
    div.append(name_and_buttons);
    if (acct.name != 'Assets' && acct.name != 'Liabilities' && acct.name != 'Equity' && acct.name != 'Revenue' && acct.name != 'Expenses') {
        let controls = mkc('ea_controls');
        let edit_btn = mkc('ea_edit_button', 'button');
        edit_btn.textContent = 'edit';
        let cancel_btn = mkc('edit_acct_cancel_button', 'button');
        cancel_btn.textContent = 'cancel';
        cancel_btn.style.display = 'none';
        let save_btn = mkc('edit_acct_save_button', 'button');
        save_btn.textContent = 'save';
        save_btn.style.display = 'none';
        let delete_btn = mkc('edit_acct_delete_button', 'button');
        delete_btn.textContent = 'delete';
        delete_btn.style.display = 'none';
        delete_btn.disabled = acct.usedInJournal || acct.subs.length > 0 ? true : false;
        let mv_up_btn = mkc('edit_acct_mvup_button', 'button');
        mv_up_btn.textContent = 'move up';
        mv_up_btn.style.display = 'none';
        let mv_dn_btn = mkc('edit_acct_mvdn_button', 'button');
        mv_dn_btn.textContent = 'move down';
        mv_dn_btn.style.display = 'none';
        controls.append(edit_btn, cancel_btn, save_btn, delete_btn, mv_up_btn, mv_dn_btn);
        name_and_buttons.append(controls);

        let opts = mkc('ea_opts');
        opts.style.display = 'none';

        let type_opts = mkc('ea_type_opts');
        let typelbl = mk('label');
        typelbl.textContent = 'type: ';
        let type = mkc('ea_type', 'select');
        type.disabled = true;
        let opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'account type'
        let optA = document.createElement('option');
        optA.value = 'A';
        optA.textContent = 'asset'
        optA.selected = acct.typecodes.includes('A');
        let optL = document.createElement('option');
        optL.value = 'L';
        optL.textContent = 'liability';
        optL.selected = acct.typecodes.includes('L');
        let optQ = document.createElement('option');
        optQ.value = 'Q';
        optQ.textContent = 'equity';
        optQ.selected = acct.typecodes.includes('Q');
        let optR = document.createElement('option');
        optR.value = 'R';
        optR.textContent = 'revenue';
        optR.selected = acct.typecodes.includes('R');
        let optE = document.createElement('option');
        optE.value = 'E';
        optE.textContent = 'expense';
        optE.selected = acct.typecodes.includes('E');
        type.append(opt0, optA, optL, optQ, optR, optE);
        type_opts.append(typelbl, type);
        opts.append(type_opts);

        let parent_opts = mkc('ea_parent_opts');
        let parentlbl = mk('label');
        parentlbl.textContent = 'sub of: ';
        let parent = mkc('ea_parent', 'select');
        parent.disabled = true;
        let acct_opt_els = getAcctOptEls(acct.typecodes.includes('A') ? 'A'
        : acct.typecodes.includes('L') ? 'L'
        : acct.typecodes.includes('Q') ? 'Q'
        : acct.typecodes.includes('R') ? 'R'
        : acct.typecodes.includes('E') ? 'E' : '', acct.parent);
        let disqualified_parents = getListOfAllSubAccts(acct.name);
        for (const opt of acct_opt_els) {
            if (!disqualified_parents.includes(opt.value) && acct.typecodes && acct.typecodes != 'P') {
                parent.append(opt);
            }
        }
        parent_opts.append(parentlbl, parent);
        opts.append(parent_opts);

        let pmt_opt = mkc('ea_pmt_opt');
        pmt_opt.style.display = acct.typecodes.includes('A') || acct.typecodes.includes('L') ? 'block' : 'none';
        let pmtlbl = mk('label');
        pmtlbl.textContent = 'makes payments: ';
        let payments = mkc('ea_payments', 'input');
        payments.type = 'checkbox';
        payments.checked = acct.typecodes.includes('P');
        payments.disabled = true;
        pmt_opt.append(pmtlbl, payments);
        opts.append(pmt_opt);

        let budget_opts = mkc('ea_budget_opts');
        budget_opts.style.display = acct.typecodes.includes('R') || acct.typecodes.includes('E') ? 'block' : 'none';
        let budget_opt = mkc('ea_budget_opt');
        let budgetlbl = mk('label');
        budgetlbl.textContent = 'budgeting: ';
        let budget_chk = mkc('ea_budget_chk', 'input');
        budget_chk.type = 'checkbox';
        budget_chk.checked = acct.typecodes.includes('B');
        budget_chk.disabled = true;
        budget_opt.append(budgetlbl, budget_chk);
        budget_opts.append(budget_opt);

        let budget_amt_opt = mkc('ea_budget_amt_opt');
        budget_amt_opt.style.display = acct.typecodes.includes('B') ? 'block' : 'none';
        let budget_amtlbl = mk('label');
        budget_amtlbl.textContent = 'monthly budget: ';
        let budget_amt = mkc('ea_budget_amt', 'input');
        budget_amt.type = 'number';
        budget_amt.step = '0.01';
        budget_amt.min = '0.00';
        budget_amt.max = '9999.99';
        budget_amt.disabled = true;
        budget_amt.value = acct.budget;
        budget_amt_opt.append(budget_amtlbl, budget_amt);
        budget_opts.append(budget_amt_opt);

        let budget_exp_opt = mkc('ea_budget_exp_opt');
        budget_exp_opt.style.display = acct.typecodes.includes('B') && acct.typecodes.includes('E') ? 'block' : 'none';
        let budget_exp_lbl = mk('label');
        budget_exp_lbl.textContent = 'expense type: ';
        let expType = mkc('ea_budget_exp', 'select');
        expType.disabled = true;
        let expOpt0 = document.createElement('option');
        expOpt0.value = '';
        expOpt0.textContent = 'budget type...'
        let discOpt = document.createElement('option');
        discOpt.value = 'D';
        discOpt.textContent = 'discretionary';
        discOpt.selected = acct.typecodes.includes('D');
        let setOpt = document.createElement('option');
        setOpt.value = 'S';
        setOpt.textContent = 'set amount';
        setOpt.selected = acct.typecodes.includes('S');
        expType.append(expOpt0, discOpt, setOpt);
        budget_exp_opt.append(budget_exp_lbl, expType);
        budget_opts.append(budget_exp_opt);
        opts.append(budget_opts);
        div.append(opts);
    }

    let subs = mkc('ea_sub_accts');
    div.append(subs);
    return div;
}

function populateEditAccts() {
    let nestedAccts = getNestedAccts();
    let target = document.getElementById('edit_accts');
    while (target.firstChild) {
        target.firstChild.remove();
    }

    function addSubsToParentLine(parentLine, subAcct) {
        let sub_acct_line = getEditAcctLine(subAcct);
        for (const child of parentLine.children) {
            if (child.classList.contains('ea_sub_accts')) {
                child.append(sub_acct_line);
            }
        }
        if (subAcct.subs.length > 0) {
            for (const subSubAcct of subAcct.subs) {
                addSubsToParentLine(sub_acct_line, subSubAcct);
            }
        }
    }

    for (const acct of nestedAccts) {
        let root_acct_line = getEditAcctLine(acct);
        for (const subAcct of acct.subs) {
            addSubsToParentLine(root_acct_line, subAcct);
        }
        target.append(root_acct_line);
    }
}

function initializeEditAccts() {
    let add_acct_btn = mk('button');
    add_acct_btn.textContent = 'Create new account';
    add_acct_btn.onclick = editAcctCreateNewAcct;
    document.getElementById('navbar_buttons').append(add_acct_btn);
    populateEditAccts();
}

function getEditAcctLineEls(edit_acct_line) {
    /*  returns {
            orig: {
                name: str
                typecodes: str
                parent: str
                budget: str 
            }
            arrow:element,
            name:element,
            edit_btn:element,
            cancel_btn:element,
            save_btn:element,
            del_btn:element,
            opts:,
            type:element,
            parent:element,
            pmt_opt:element,
            pmt:element,
            budget_opts:,
            budget_chk:,
            budget_amt_opt:
            budget_amt:,
            budget_exp_opt:,
            budget_exp:,
            subs:element,
            hasSubs:boolean,
        }
    */
    let els = {orig: JSON.parse(edit_acct_line.dataset.orig)};


    function checkChildren(parent) {
        for (const child of parent.children) {
            if (child.classList.contains('ea_arrow')) {
                els.arrow = child;
                continue;
            }
            if (child.classList.contains('ea_name')) {
                els.name = child;
                continue;
            }
            if (child.classList.contains('ea_edit_button')) {
                els.edit_btn = child;
                continue;
            }
            if (child.classList.contains('edit_acct_cancel_button')) {
                els.cancel_btn = child;
                continue;
            }
            if (child.classList.contains('edit_acct_save_button')) {
                els.save_btn = child;
                continue;
            }
            if (child.classList.contains('edit_acct_delete_button')) {
                els.del_btn = child;
                continue;
            }
            if (child.classList.contains('edit_acct_mvup_button')) {
                els.mvup_btn = child;
                continue;
            }
            if (child.classList.contains('edit_acct_mvdn_button')) {
                els.mvdn_btn = child;
                continue;
            }
            if (child.classList.contains('ea_opts')) {
                els.opts = child;
            }
            if (child.classList.contains('ea_type')) {
                els.type = child;
                continue;
            }
            if (child.classList.contains('ea_parent')) {
                els.parent = child;
                continue;
            }
            if (child.classList.contains('ea_pmt_opt')) {
                els.pmt_opt = child;
            }
            if (child.classList.contains('ea_payments')) {
                els.pmt = child;
                continue;
            }
            if (child.classList.contains('ea_budget_opts')) {
                els.budget_opts = child;
            }
            if (child.classList.contains('ea_budget_chk')) {
                els.budget_chk = child;
                continue;
            }
            if (child.classList.contains('ea_budget_amt_opt')) {
                els.budget_amt_opt = child;
            }
            if (child.classList.contains('ea_budget_amt')) {
                els.budget_amt = child;
                continue;
            }
            if (child.classList.contains('ea_budget_exp_opt')) {
                els.budget_exp_opt = child;
            }
            if (child.classList.contains('ea_budget_exp')) {
                els.budget_exp = child;
                continue;
            }
            if (child.classList.contains('ea_sub_accts')) {
                els.subs = child;
                let hasSubs = false;
                for (const gchild of child.children) {
                    if (gchild.classList.contains('ea_line')) {
                        hasSubs = true;
                        break;
                    }
                }
                els.hasSubs = hasSubs;
                continue;
            }

            if (child.children) {
                checkChildren(child);
            }
        }
    }
    checkChildren(edit_acct_line);
    return els;
}

function editAcctToggleSubs(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    if (els.hasSubs === true) {
        if (els.subs.style.display == 'none') {
            els.subs.style.display = 'block';
            els.arrow.textContent = '\u21A7';
        } else {
            els.subs.style.display = 'none';
            els.arrow.textContent = '\u21A6';
        }
    }
}

function editAcctEditLine(edit_acct_line) {
    isSignedIn(() => {
        let els = getEditAcctLineEls(edit_acct_line);
        els.name.disabled = false;
        els.edit_btn.style.display = 'none';
        els.cancel_btn.style.display = 'inline';
        els.save_btn.style.display = 'inline';
        els.del_btn.style.display = 'inline';
        els.mvup_btn.style.display = 'inline';
        els.mvdn_btn.style.display = 'inline';
        els.opts.style.display = 'flex';
        if (!els.hasSubs) {
            els.type.disabled = false;
        }
        els.parent.disabled = false;
        els.pmt.disabled = false;
        els.budget_chk.disabled = false;
        els.budget_amt.disabled = false;
        els.budget_exp.disabled = false;
    })
}

function editAcctCancelEdit(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    els.name.disabled = true;
    els.edit_btn.style.display = 'inline';
    els.cancel_btn.style.display = 'none';
    els.save_btn.style.display = 'none';
    els.del_btn.style.display = 'none';
    els.mvup_btn.style.display = 'none';
    els.mvdn_btn.style.display = 'none';
    els.opts.style.display = 'none';
    els.type.disabled = true;
    els.parent.disabled = true;
    els.pmt.disabled = true;
    els.budget_chk.disabled = true;
    els.budget_amt.disabled = true;
    els.budget_exp.disabled = true;
}

async function editAcctSaveAcct(edit_acct_line) {
    isSignedIn(async () => {
        let values;
        try {
            let response = await gapi.client.sheets.spreadsheets.values.batchGet({
                spreadsheetId: ssid,
                ranges: ['Account List!A2:D', 'Journal!A2:E']
            });
            let liveAccts = response.result.valueRanges[0].values;
            journal = response.result.valueRanges[1].values;
            let sameLength = accts.length == liveAccts.length;
            let acctNamesMatch = true;
            for (let i = 0; i > liveAccts.length; i++) {
                if (liveAccts[i][0] != accts[i][0]) acctNamesMatch = false;
            }
            if (sameLength == false || acctNamesMatch == false) {
                accts = liveAccts;
                populateEditAccts();
                throw new Error('Account list has become unsynced. Please try again.')
            }
            values = editAcctValidateLine(edit_acct_line);
        } catch(err) {
            flash(err.message);
            console.log(err);
            return;
        }
        let els = getEditAcctLineEls(edit_acct_line);
        let nameChanged = false;
        let merging = false;
        if (values.name != els.orig.name) {
            nameChanged = true;
            for (const a of accts) {
                if (a[0] == values.name) {
                    merging = true;
                    break;
                }
            }
        }
        let typecodeChanged = values.typecodes != els.orig.typecodes;
        let parentChanged = values.parent_acct != els.orig.parent;
        let budgetChanged = values.budget != els.orig.budget;
        if (nameChanged || typecodeChanged || parentChanged || budgetChanged) {
            let ssranges = [];
            let ssvalues = [];
            let newRow = [
                values.name,
                values.typecodes,
                values.parent_acct,
                values.budget
            ]
            let origAcctsIndex;
            for (let i = 0; i < accts.length; i++) {
                if (accts[i][0] == els.orig.name) {
                    origAcctsIndex = i;
                }
            }
            if (merging) {
                flash(`This will irreversibly merge ${els.orig.name} into ${values.name}. Proceed with extreme caution.`, () => {
                    for (const row of accts) {
                        if (row[2] == els.orig.name) row[2] = values.name;
                    }
                    ssranges.push('Account List!A2');
                    ssvalues.push([...accts.toSpliced(origAcctsIndex, 1), ['','','','']]);
                });
            }
            if (!merging) {
                if (parentChanged) {
                    accts.splice(origAcctsIndex, 1);
                    let destinationIndex;
                    let subsToSkip = [];
                    for (let i = 0; i < accts.length; i++) {
                        if (accts[i][0] == values.parent_acct || subsToSkip.includes(accts[i][2])) {
                            subsToSkip.push(accts[i][0]);
                            destinationIndex = i + 1;
                        }
                    }
                    accts.splice(destinationIndex, 0, newRow);
                    if (nameChanged) {
                        for (const row of accts) {
                            if (row[2] == els.orig.name) row[2] = values.name;
                        }
                    }
                    organizeSubAccts(values.name);
                    ssranges.push('Account List!A2');
                    ssvalues.push(accts);
                } else { // the account name, typecodes, or budget has changed, the parent has not changed, and we are not merging
                    ssranges.push(`Account List!A${origAcctsIndex + 2}`); // +1 for header row, +1 for index 1
                    ssvalues.push([newRow]);
                }
            }
            if (nameChanged) {
                let entries_to_update = [];
                for (let i = 0; i < journal.length; i++) {
                    let row = journal[i];
                    if (row[2] == els.orig.name) {
                        entries_to_update.push(i + 2)
                    }
                }
                for (const row_no of entries_to_update) {
                    ssranges.push(`Journal!C${row_no}`);
                    ssvalues.push([[values.name]]);
                }
                let rcrgs_to_update = [];
                for (let i = 0; i < rcrgs.length; i++) {
                    let row = rcrgs[i];
                    if (row[4] == els.orig.name) {
                        rcrgs_to_update.push(i + 2);
                    }
                }
                for (const row_no of rcrgs_to_update) {
                    ssranges.push(`Recurring Entries!E${row_no}`);
                    ssvalues.push([[values.name]]);
                }
            }
            let valuesUpdated = async function() {
                flash('Account updated.');
                await bha_sync();
                resetViewsAfterSync();
            }
            batchUpdateValues(ssranges, ssvalues, valuesUpdated);
        }
        
    })    
}

function getNewAcctLine(template) {
    if (!template) template = {name:'',typecodes:'',parent:'',budget:'',subs:[]};
    if (!template.hasOwnProperty('name')) template.name = '';
    if (!template.hasOwnProperty('typecodes')) template.typecodes = '';
    if (!template.hasOwnProperty('parent')) template.parent = '';
    if (!template.hasOwnProperty('budget')) template.budget = '';
    if (!template.hasOwnProperty('subs')) template.subs = [];
    let div = getEditAcctLine(template);
    div.classList.add('popunder');
    editAcctEditLine(div);
    let els = getEditAcctLineEls(div);
    els.edit_btn.remove();
    els.del_btn.remove();
    els.mvup_btn.remove();
    els.mvdn_btn.remove();
    els.save_btn.classList.remove('edit_acct_save_button');
    els.save_btn.classList.add('edit_acct_save_new_button');
    els.cancel_btn.classList.remove('edit_acct_cancel_button');
    els.cancel_btn.classList.add('edit_acct_cancel_new_button');
    return div;
}

function editAcctCreateNewAcct() {
    isSignedIn(() => {
        let div = getNewAcctLine();
        if (document.getElementById('edit_accts').firstChild) {
            document.getElementById('edit_accts').firstChild.before(div);
        } else {
            document.getElementById('edit_accts').append(div);
        }
    })
}

async function editAcctSaveNewAcct(edit_acct_line) {
    isSignedIn(async () => {
        let values;
        try {
            await acctsStillSynced();
            values = editAcctValidateLine(edit_acct_line);
            for (const row of accts) {
                if (row[0] == values.name) {
                    throw new Error('Account name already exists.');
                } 
            }
        } catch(err) {
            flash(err.message);
            console.log(err);
            return;
        }
        let entryAcctToFill = false;
        if (edit_acct_line.previousElementSibling && edit_acct_line.previousElementSibling.classList.contains('entry_acct')) entryAcctToFill = edit_acct_line.previousElementSibling;
        let destinationIndex;
        let subsToSkip = [];
        for (let i = 0; i < accts.length; i++) {
            if (accts[i][0] == values.parent_acct || subsToSkip.includes(accts[i][2])) {
                subsToSkip.push(accts[i][0]);
                destinationIndex = i + 2; // +1 for header, +1 to put after
            }
        }
        console.log(subsToSkip, destinationIndex)
        try {
            await insertRows('Account List', destinationIndex, destinationIndex + 1);
            batchUpdateValues(
                [`Account List!A${destinationIndex + 1}`],
                [[[
                    values.name,
                    values.typecodes,
                    values.parent_acct,
                    values.budget
                ]]],
                async function() {
                    await bha_sync();
                    edit_acct_line.remove(); // if we're adding an account from somewhere other than the Edit Accounts pane
                    populateEditAccts();
                    let entryInputsToUpdate = document.getElementsByClassName('entry');
                    for (const entry_line of entryInputsToUpdate) {
                        let type = JSON.parse(entry_line.dataset.origentry).type ? JSON.parse(entry_line.dataset.origentry).type : '';
                        updateEntryOpts(entry_line, type);
                    }
                    if (entryAcctToFill !== false) {
                        for (const child of entryAcctToFill.children) {
                            if (child.classList.contains('deb_acct') || child.classList.contains('cred_acct')) {
                                let newAcctInOptions;
                                for (const opt of child.children) {
                                    if (opt.value == values.name) newAcctInOptions = true;
                                }
                                if (newAcctInOptions === true) {
                                    child.value = values.name;
                                }
                            }
                        }
                    }
                }
            );
        } catch(err) {
            flash(err.message);
            console.log(err);
            return;
        }
    });
}

function editAcctValidateLine(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    let values = {
        name: els.name.value ? els.name.value : '',
        typecodes: '',
        parent_acct: els.parent.value ? els.parent.value : '',
        budget: '',
    }
    let errors = '';
    values.typecodes += els.type.value;
    if (!values.typecodes) {
        errors += 'Type is required. ';
    } else if ((values.typecodes.includes('A') || values.typecodes.includes('L')) && els.pmt.checked) {
        values.typecodes += 'P';
    } else if ((values.typecodes.includes('R') || values.typecodes.includes('E')) && els.budget_chk.checked) {
        values.typecodes += 'B';
        values.budget = els.budget_amt.value ? els.budget_amt.value : '';
        if (els.budget_exp.value) {
            values.typecodes += els.budget_exp.value;
        } else if (values.typecodes.includes('E')) {
            errors += 'Expense budgeting type is required. ';
        }
    }
    if (!values.name) {
        errors += 'Name is required. ';
    } else {
        if (values.name == '***') {
            errors += 'Account name not allowed. '
        }
    }
    if (!values.parent_acct) {
        errors += 'Parent is required. ';
    }
    if (errors) {
        throw new Error(errors);
    } else {
        return values;
    }
}

function editAcctCancelNewAcct(edit_acct_line) {
    edit_acct_line.remove();
}

async function acctsStillSynced() {
    let accts_response;
    try {
        accts_response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: ssid,
            ranges: ['Account List!A2:D']
        });
    } catch (err) {
        flash(err.message);
        console.log(err);
        return;
    }
    let liveAccts = accts_response.result.valueRanges[0].values;
    let sameLength = accts.length == liveAccts.length;
    let acctNamesMatch = true;
    for (let i = 0; i > liveAccts.length; i++) {
        if (liveAccts[i][0] != accts[i][0]) acctNamesMatch = false;
    }
    if (sameLength == false || acctNamesMatch == false) {
        accts = liveAccts;
        populateEditAccts();
        throw new Error('Account list has become unsynced. Please try again.')
    }
}

async function eaMvLineUp(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    let name = els.orig.name ? els.orig.name : '';
    let parent = els.orig.parent ? els.orig.parent : '';
    let currentSsIndex;
    let parentSsIndex;
    let destinationSsIndex;
    
    for (let i = 0; i < accts.length; i++) {
        if (accts[i][0] == name) {
            currentSsIndex = i;
        }
        if (accts[i][0] == parent) {
            parentSsIndex = i;
        }
    }
    for (let i = currentSsIndex - 1; i > parentSsIndex; i--) {
        if (accts[i][2] == parent) { 
            destinationSsIndex = i; // move it ahead of the previous account with the same parent
            break;
        }
    }
    if (!destinationSsIndex) {
        els.mvup_btn.disabled = true;
        return;
    }
    try {
        await acctsStillSynced();
    } catch(err) {
        flash(err.message);
        console.log(err);
        return;
    }
    accts.splice(destinationSsIndex, 0, accts.splice(currentSsIndex, 1)[0]);
    organizeSubAccts(name);
    batchUpdateValues(['Account List!A2'], [accts], populateEditAccts()); // no need to Sync because we've already updated the entire accts array
}

function organizeSubAccts(name) {
    let acctsToMove = [];
    function extractSubs(parent) {
        for (let i = 0; i < accts.length; i++) {
            if (accts[i][2] == parent) {
                let subName = accts[i][0];
                acctsToMove.push(accts.splice(i, 1)[0]);
                extractSubs(subName);
                i--; // run the same index again because we removed the item at current index.
            }
        }
    }
    extractSubs(name);
    for (let i = 0; i < accts.length; i++) {
        if (accts[i][0] == name) {
            accts.splice(i + 1, 0, ...acctsToMove);
            break;
        }
    }
}

async function eaMvLineDown(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    let name = els.orig.name ? els.orig.name : '';
    let parent = els.orig.parent ? els.orig.parent : '';
    let currentSsIndex;
    let destinationSsIndex;
    for (let i = 0; i < accts.length; i++) {
        if (accts[i][0] == name) {
            currentSsIndex = i;
        }
    }
    let nextSibling;
    let subsToSkip = [];
    for (let i = currentSsIndex + 1; i < accts.length; i++) {
        if (!nextSibling && accts[i][2] == parent) {
            nextSibling = accts[i][0];
            destinationSsIndex = i + 1;
        }
        if (accts[i][2] == nextSibling || subsToSkip.includes(accts[i][2])) {
            subsToSkip.push(accts[i][0]);
            destinationSsIndex = i + 1;
        }
    }
    if (!destinationSsIndex) {
        els.mvdn_btn.disabled = true;
        return;
    }
    try {
        await acctsStillSynced();
    } catch(err) {
        flash(err.message);
        console.log(err);
        return;
    }
    accts.splice(destinationSsIndex - 1, 0, accts.splice(currentSsIndex, 1)[0]); // must subtract 1 from destination index because we've removed an earlier index with the splice.
    organizeSubAccts(name);
    batchUpdateValues(['Account List!A2'], [accts], populateEditAccts()); // no need to Sync because we've already updated the entire accts array
}

function editAcctDeleteAcct(edit_acct_line) {
    isSignedIn(() => {
        let els = getEditAcctLineEls(edit_acct_line);
        let name = els.name.value ? els.name.value : '';
        let index;
        for (let i = 0; i < accts.length; i++) {
            if (accts[i][0] == name) {
                index = i + 1;
            }
        }
        if (index) {
            deleteRows('Account List', index, index + 1, async function() {
                await bha_sync();
                flash(`Account ${name} deleted.`);
                populateEditAccts();
                let entriesToUpdate = document.getElementsByClassName('entry');
                for (const entry_line of entriesToUpdate) {
                    let type = JSON.parse(entry_line.dataset.origentry).type ? JSON.parse(entry_line.dataset.origentry).type : '';
                    updateEntryOpts(entry_line, type);
                }                  
            })
        }
    })
}

function editAcctTypeChanged(edit_acct_line) {
    editAcctShowHideOptions(edit_acct_line);
    let els = getEditAcctLineEls(edit_acct_line);
    let type = els.type.value;
    while (els.parent.firstChild) {
        els.parent.firstChild.remove();
    }
    let acct_opt_els = getAcctOptEls(type);
    let disqualified_parents = getListOfAllSubAccts(els.orig.name);
    for (const opt of acct_opt_els) {
        if (!disqualified_parents.includes(opt.value) && type) {
            els.parent.append(opt);
        }
    }
}

function editAcctShowHideOptions(edit_acct_line) {
    let els = getEditAcctLineEls(edit_acct_line);
    let type = els.type.value;
    if (type == 'A' || type == 'L') {
        els.pmt_opt.style.display = 'block';
    } else {
        els.pmt.checked = false;
        els.pmt_opt.style.display = 'none';
    }
    if (type == 'E' || type == 'R') {
        els.budget_opts.style.display = 'flex';
    } else {
        els.budget_opts.style.display = 'none';
    }
    if (els.budget_chk.checked == true) {
        els.budget_amt_opt.style.display = 'block';
        if (type == 'E') {
            els.budget_exp_opt.style.display = 'block';
        } else {
            els.budget_exp_opt.style.display = 'none';
        }
    } else {
        els.budget_amt_opt.style.display = 'none';
        els.budget_exp_opt.style.display = 'none';
    }
}

let editAcctClickHandler = function(e) {
    if (e.target.classList.contains('ea_arrow')) {
        let edit_acct_line = e.target.parentElement.parentElement;
        editAcctToggleSubs(edit_acct_line);
    } else if (e.target.classList.contains('ea_edit_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctEditLine(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_cancel_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctCancelEdit(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_save_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctSaveAcct(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_delete_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctDeleteAcct(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_save_new_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctSaveNewAcct(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_cancel_new_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctCancelNewAcct(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_mvup_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        eaMvLineUp(edit_acct_line);
    } else if (e.target.classList.contains('edit_acct_mvdn_button')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        eaMvLineDown(edit_acct_line);
    }
}

let editAcctChangeHandler = function(e) {
    if (e.target.classList.contains('ea_type')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement;
        editAcctTypeChanged(edit_acct_line);
    } else if (e.target.classList.contains('ea_budget_chk')) {
        let edit_acct_line = e.target.parentElement.parentElement.parentElement.parentElement;
        editAcctShowHideOptions(edit_acct_line);
    }
}

// END MODULE Edit Accts BEGIN MODULE Ledgers

function get_ledger(from_date, to_date, type) { // date = '2024-05-24'; type = 'A'
    /* returns
    {
        acct_name: {
            debit: 0, 
            credit: 0, 
            parent: parent_acct_name 
            ledger_entries: [{entry object}],
            has_sub_accounts: true/false,
            debit_from_subs: 0,
            credit_from_subs: 0,
            types: typecode string from accts,
            budgeted_amt: budgeted_amt from accts,
        },
    }
    */

    let accts_list = {};

    function add_acct_to_obj(acct, obj) { // acct is a row of the 'Account List' sheet of the Google Sheets spreadsheet
        const name = acct[0];
        const add_acct_type = acct[1] ? acct[1] : '';
        const parent_name = acct[2];
        const budgeted_amt = acct[3] ? parseFloat(acct[3]) : 0;
        if (parent_name) { // if there's a parent, make the parent first
            if (!obj.hasOwnProperty(parent_name)) {
                for (const parent_acct of accts) {
                    if (parent_acct[0] == parent_name) {
                        add_acct_to_obj(parent_acct, obj);
                    }
                }
            }
            if (obj[parent_name]['has_sub_accounts'] == false) {
                obj[parent_name]['has_sub_accounts'] = true; // we've made the parent or the first child, now change the flag.
            }
        }
        
        if (!obj.hasOwnProperty(name)) {
            obj[name] = {
                debit: 0, 
                credit: 0, 
                parent: parent_name ? parent_name : '',
                ledger_entries: [],
                has_sub_accounts: false,
                debit_from_subs: 0,
                credit_from_subs: 0,
                types: add_acct_type,
                budgeted_amt: budgeted_amt,
            }
        }
        
        for (const child_acct of accts) {
            if (child_acct[2] == name && (child_acct[1].includes(type) || !type)) {
                if (!obj.hasOwnProperty(child_acct[0])) {
                    add_acct_to_obj(child_acct, obj); // skips the first half of the parent block above but does change the flag in the second half
                }
            }
        }
    }

    function debit(acct, amt) {
        accts_list[acct].debit = parseFloat((accts_list[acct].debit + parseFloat(amt)).toFixed(2));

        function debit_parent(parent) {
            if (accts_list.hasOwnProperty(parent)) {
                accts_list[parent].debit_from_subs = parseFloat((accts_list[parent].debit_from_subs + parseFloat(amt)).toFixed(2)); // debit the first-level parent first
                if (accts_list[parent].hasOwnProperty('parent')) {
                    debit_parent(accts_list[parent].parent);
                }
            }
        }
        debit_parent(accts_list[acct].parent);
    }

    function credit(acct, amt) {
        accts_list[acct].credit = parseFloat((accts_list[acct].credit + parseFloat(amt)).toFixed(2));

        function credit_parent(parent) {
            if (accts_list.hasOwnProperty(parent)) {
                accts_list[parent].credit_from_subs = parseFloat((accts_list[parent].credit_from_subs + parseFloat(amt)).toFixed(2)); // credit the first-level parent first
                if (accts_list[parent].hasOwnProperty('parent')) {
                    credit_parent(accts_list[parent].parent);
                }
            }
        }
        credit_parent(accts_list[acct].parent);
    }

    for (const acct of accts) {
        if (!type || (acct.length > 1 && acct[1].includes(type))) {
                add_acct_to_obj(acct, accts_list);
        }
    }
    let entryList = getJournalEntriesByDate(from_date, to_date);
    for (const entry of entryList) {
        for (let i = 0; i < entry.deb_accts.length + entry.cred_accts.length; i++) {
            if (i < entry.deb_accts.length) {
                let acct = entry.deb_accts[i];
                let amt = entry.deb_amts[i];
                if (accts_list.hasOwnProperty(acct)) {
                    debit(acct, amt);
                    accts_list[acct].ledger_entries.push(entry);
                }
            } else {
                let j = i - entry.deb_accts.length;
                let acct = entry.cred_accts[j];
                let amt = entry.cred_amts[j];
                if (accts_list.hasOwnProperty(acct)) {
                    credit(acct, amt);
                    accts_list[acct].ledger_entries.push(entry);
                }
            }
        }
    }
    return accts_list;
}

function initializeLedgers() {
    let from_date_input = document.createElement('input');
    from_date_input.id = 'ledger_from_date';
    from_date_input.type = 'date';
    from_date_input.value = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-01`;
    let date_label = document.createElement('label');
    date_label.textContent = 'to';
    let to_date_input = document.createElement('input');
    to_date_input.id = 'ledger_to_date';
    to_date_input.type = 'date';
    to_date_input.value = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    document.getElementById('navbar_buttons').append(from_date_input, date_label, to_date_input);
    
    let acctSelEl = document.getElementById('ledgers_accts_select');
    while (acctSelEl.firstChild) {
        acctSelEl.firstChild.remove();
    }
    let blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = 'All accounts';
    acctSelEl.append(blankOpt);
    let acct_types = '';
    for (const acct of accts) {
        if (acct[1]) {
            for (const type of acct[1]) {
                if (!acct_types.includes(type)) {
                    acct_types += type;
                }
            }
        }
    }
    for (const type of acct_types) {
        let opt = document.createElement('option');
        opt.value = type;
        opt.textContent = acct_type_key.hasOwnProperty(type) ? acct_type_key[type] : type;
        acctSelEl.append(opt);
    }
    acctSelEl.value = acct_types.includes('D') ? 'D' : '';

    handleLedgersQuery();
}

function handleLedgersQuery() {
    let from_date = document.getElementById('ledger_from_date').value;
    let to_date = document.getElementById('ledger_to_date').value;
    let acct_class = document.getElementById('ledgers_accts_select').value;
    let ledger = get_ledger(from_date, to_date, acct_class);

    target = document.getElementById('ledgers_display');
    while (target.firstChild) target.firstChild.remove();
    for (const key in ledger) {
        let line = getLedgerLine(key, ledger[key]);
        target.append(line);
    }
}

function getLedgerLine(acct, data) {
    let div = mkc('ledger_line');
    div.dataset.acct = acct;
    div.dataset.parent = data.parent;
    div.dataset.has_sub_accounts = data.has_sub_accounts;
    let summ = mkc('ledger_summary');
    let arrow = mkc('ledger_line_arrow');
    arrow.textContent = data.has_sub_accounts ? '\u21A7' : '';
    arrow.dataset.status = data.has_sub_accounts ? 'shown' : 'none';
    let name = mkc('ledger_acct');
    name.textContent = acct + ':';

    let net = mkc('ledger_net');
    let d = data.debit + data.debit_from_subs;
    let c = data.credit + data.credit_from_subs;
    if (d == 0 && c == 0) {
        net.textContent = '--'
    } else if (d > c) {
        if (c == 0) {
            net.textContent = `$${insertCommas(parseFloat(d).toFixed(2))} / --`;
        } else {
            net.textContent = `$${insertCommas(parseFloat(d - c).toFixed(2))} / \u0394`
        }
    } else if (c > d) {
        if (d == 0) {
            net.textContent = `-- / $${insertCommas(parseFloat(c).toFixed(2))}`;
        } else {
            net.textContent = `\u0394 / $${insertCommas(parseFloat(c - d).toFixed(2))}`
        }
    } else if (d == c) {
        net.textContent = '\u0394 --';
    }
    let tog = mkc('toggle_ledger_entries', 'button');
    tog.textContent = '\u21A4';
    if (data.ledger_entries.length == 0) tog = '';
    summ.append(arrow, name, net, tog);
    let entries = mkc('ledger_entries');
    let totNums = mkc('ledger_totals');
    let totDeb = mkc('ledger_tot_deb');
    totDeb.textContent = data.debit == 0 ? 'debits: 0' : 'debits: $' + insertCommas(parseFloat(data.debit).toFixed(2));
    let s = mkc('ledger_tot_divider');
    s.textContent = ' / ';
    let totCred = mkc('ledger_tot_cred')
    totCred.textContent = data.credit == 0 ? 'credits: 0' : 'credits: $' + insertCommas(parseFloat(data.credit).toFixed(2));
    totNums.append(totDeb, s, totCred);
    entries.append(totNums);
    let list = mk();
    for (const entry of data.ledger_entries) {
        let entrydiv = getEntryInputLine(entry);
        list.append(entrydiv);
    }
    entries.append(list);
    entries.style.display = 'none';
    div.append(summ, entries);
    return div;
}

function getLedgerLineEls(ledger_line) {
    /* returns {
        togSubs: .ledger_line_arrow,
        entries: .ledger_entries,
        togEntries: .toggle_ledger_entries,
    } */
    let els = {};
    function checkChildren(parent) {
        for (const el of parent.children) {
            if (el.classList.contains('ledger_line_arrow')) els.togSubs = el;
            if (el.classList.contains('ledger_entries')) els.entries = el;
            if (el.classList.contains('toggle_ledger_entries')) els.togEntries = el;
            if (el.classList.contains('nm_bud')) els.budget = el;
            if (el.classList.contains('nm_adj_bud')) els.adj_bud_btn = el;
            if (el.classList.contains('eom_nm_ro')) els.rollover = el;
            if (el.classList.contains('adj_ro_btn')) els.rollover_btn = el;
            if (el.children) checkChildren(el);
        }
    }
    checkChildren(ledger_line);
    return els;
}

function toggleLedgerSubs(ledger_line) {
    if (JSON.parse(ledger_line.dataset.has_sub_accounts)) {
        let els = getLedgerLineEls(ledger_line);
        let status = els.togSubs.dataset.status;
        let parentsToHide = [ledger_line.dataset.acct];
        let ledger_line_container = ledger_line.parentElement;
        for (const line of ledger_line_container.children) {
            const parent = line.dataset.parent;
            if (parentsToHide.includes(parent)) {
                parentsToHide.push(line.dataset.acct);
                if (status == 'hidden') {
                    line.style.display = 'block';
                } else {
                    line.style.display = 'none';
                }
            }
        }
        if (status == 'hidden') {
            els.togSubs.textContent = '\u21A7';
            els.togSubs.dataset.status = 'shown';
        } else {
            els.togSubs.textContent = '\u21A6';
            els.togSubs.dataset.status = 'hidden';
        }
    }
}

function toggleLedgerEntries(ledger_line) {
    let els = getLedgerLineEls(ledger_line);
    if (els.entries.style.display == 'none') {
        els.entries.style.display = 'block';
        els.togEntries.textContent = '\u21A7';
    } else {
        els.entries.style.display = 'none';
        els.togEntries.textContent = '\u21A4';
    }
}

function ledgersClickHandler(e) {
    if (e.target.classList.contains('ledger_line_arrow')) {
        const ledger_line = e.target.parentElement.parentElement;
        toggleLedgerSubs(ledger_line);
    } else if (e.target.classList.contains('toggle_ledger_entries')) {
        const ledger_line = e.target.parentElement.parentElement;
        toggleLedgerEntries(ledger_line);
    }
}

function ledgersChangeHandler(e) {
    if (e.target.id == 'ledgers_accts_select') {
        if (e.target.value == 'A' || e.target.value == 'L' || e.target.value == 'Q' || e.target.value == 'P') {
            document.getElementById('ledger_from_date').value = `${today.getFullYear()}-01-01`;
        } else {
            document.getElementById('ledger_from_date').value = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-01`;
        }
    }
}

// END MODULE Ledgers BEGIN MODULE EOM Review 

function initializeEomRev() {
    let month = document.createElement('select');
    month.id = 'eom_mm';
    for (let i = 0; i < months.length; i++) {
        let opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = months[i];
        month.append(opt);
    }
    month.value = today.getMonth() + 1;
    let year = document.createElement('input');
    year.id = 'eom_yyyy';
    year.type = 'number';
    year.step = '1';
    year.min = '1000';
    year.max = '9999';
    year.value = today.getFullYear();
    let btn = document.createElement('button');
    btn.textContent = 'View'
    btn.onclick = function() {
        let m = document.getElementById('eom_mm').value;
        let y = document.getElementById('eom_yyyy').value;
        eom_ledger = getEomLedger(m, y); // global variable eom_ledger declared on page load
        popEomDisplay(eom_ledger);
    }
    document.getElementById('navbar_buttons').append(month, year, btn);
}

function getEomLedger(m, y) {
    /* returns {
        m: number(string) (1 = January),
        y: number(string)
        spent: float,
        earned: float,
        surplus: float,
        deficit: float,
        budget_nm: float,
        rollover_amt: float
        projected_amt: float,
        accts: {
            acct: {
                debit: 0, 
                credit: 0, 
                parent: parent_acct_name 
                ledger_entries: [{entry object}],
                has_sub_accounts: true/false,
                debit_from_subs: 0,
                credit_from_subs: 0,
                types: typecode string from accts,
                budgeted_amt: budgeted_amt from accts,
                rollover_amt,
                bg_fill: '##.##%',
                deficit:, 
                surplus, 
                closed, 
                budgeted_this_month, 
                rolled_over_this_month,
            },
        }
    } */

    const ld = new Date(y, m, 0); // last day of month = day 0 of next month
    let ledger = {accts: {}};
    let l = get_ledger(`${y}-${m.toString().padStart(2, '0')}-01`, `${y}-${m.toString().padStart(2, '0')}-${ld.getDate().toString().padStart(2, '0')}`, 'E');
    let r = get_ledger(`${y}-${m.toString().padStart(2, '0')}-01`, `${y}-${m.toString().padStart(2, '0')}-${ld.getDate().toString().padStart(2, '0')}`, 'R');
    for (const k in r) l[k] = r[k];
    let spent = 0;
    let earned = 0;
    let budget_lm = 0;
    let rollover_lm = 0;
    let surplus;
    let deficit;
    let budget_nm = 0;
    let projected_amt = 0;
    for (let name in l) {
        let acct = l[name];
        if (acct.debit != 0 || acct.credit != 0 || acct.debit_from_subs != 0 || acct.credit_from_subs != 0 || acct.types.includes('B')) {
            if (acct.types.includes('E')) {
                spent += acct.debit;
                spent -= acct.credit;
                budget_nm += acct.budgeted_amt;
            } else if (acct.types.includes('R')) {
                earned += acct.credit;
                earned -= acct.debit;
                projected_amt += acct.budgeted_amt;
            }
            if ((acct.types.includes('E') && !acct.debit) || (acct.types.includes('R') && !acct.credit)) {
                acct.bg_fill = '0';
            } else if ((acct.types.includes('E') && acct.credit && acct.debit < acct.credit) || (acct.types.includes('R') && acct.debit && acct.credit < acct.debit)) {
                acct.bg_fill = `${acct.types.includes('E') ? (acct.debit / acct.credit * 100).toFixed(2) : (acct.credit / acct.debit * 100).toFixed(2)}%`;
            } else {
                acct.bg_fill = "100%";
            }
            if (acct.debit > acct.credit) {
                acct.deficit = acct.debit - acct.credit;
            }
            if (acct.credit > acct.debit) {
                acct.surplus = acct.credit - acct.debit;
                if (acct.types.includes('S')) {
                    acct.rollover_amt = acct.surplus;
                } else if (acct.types.includes('D')) {
                    acct.rollover_amt = 0;
                }
            }
            for (const entry of acct.ledger_entries) {
                if (entry.desc.substring(0,13) == 'CLOSING ENTRY') {
                    acct.closed = true;
                }
    
                if (entry.desc.substring(0,20) == 'OPENING ENTRY Budget') {
                    if (acct.types.includes('E')) {
                        acct.budgeted_this_month = entry.cred_amts[0]; 
                        spent += entry.cred_amts[0]; 
                        budget_lm += entry.cred_amts[0];
                    } else if (acct.types.includes('R')) {
                        acct.budgeted_this_month = entry.deb_amts[0];
                        earned += entry.deb_amts[0];
                    }
                }
    
                if (acct.types.includes('E') && entry.desc.substring(0,31) == 'OPENING ENTRY Retained Earnings') {
                    acct.rolled_over_this_month = entry.cred_amts[0];
                    spent += entry.cred_amts[0];
                    rollover_lm += entry.cred_amts[0];
                }
            }
            ledger.accts[name] = acct;
        }
    }
    if (spent > earned) {
        deficit = spent - earned;
    } else if (earned > spent) {
        surplus = earned - spent;
    }
    ledger.m = m;
    ledger.y = y;
    ledger.spent = parseFloat(spent.toFixed(2));
    ledger.earned = parseFloat(earned.toFixed(2));
    ledger.surplus = surplus ? parseFloat(surplus.toFixed(2)) : surplus;
    ledger.deficit = deficit ? parseFloat(deficit.toFixed(2)) : deficit;
    ledger.budget_lm = parseFloat(budget_lm.toFixed(2));
    ledger.rollover_lm = parseFloat(rollover_lm.toFixed(2));
    ledger.budget_nm = parseFloat(budget_nm.toFixed(2));
    ledger.projected_amt = parseFloat(projected_amt.toFixed(2));
    ledger.rollover_amt = 0;
    return ledger;
}

function popEomDisplay(ledger) {
    const m = ledger.m;
    const y = ledger.y;
    const rev_mo = mos[m - 1];
    const rev_month = months[m-1];
    const nxt_mo = m == 12 ? mos[0] : mos[m];
    const nxt_month = m == 12 ? months[0] : months[m];
    let eom_rev = document.getElementById('eom_rev');
    while (eom_rev.firstChild) {
        eom_rev.firstChild.remove()
    };
    for (const acct in ledger.accts) {
        const a = ledger.accts[acct];
        let eom_div = mkc('eom_line');
        let lmEl = mkc('eom_last_month');
        let lmbud = mkc('eom_lm_budget');
        lmbud.style.display = a.types.includes('B') ? 'block' : 'none';
        lmbud.textContent = `${a.types.includes('E') ? 'Budgeted' : 'Projected'} for ${rev_mo}: $${a.budgeted_this_month ? insertCommas(a.budgeted_this_month.toFixed(2)): '0.00'}`;
        lmEl.append(lmbud);
        let lm_ro = document.createElement('div');
        lm_ro.style.display = a.types.includes('E') && a.types.includes('B') ? 'block' : 'none';
        lm_ro.textContent = `Rolled over: $${a['rolled_over_this_month'] ? a['rolled_over_this_month'] : '0.00'}`;
        lmEl.append(lm_ro);
        let lm_cash = document.createElement('div');
        lm_cash.textContent = a.types.includes('E') ? `Spent in ${rev_mo}: $${insertCommas(a.debit.toFixed(2))}` : `${rev_mo} earnings: $${insertCommas(a.credit.toFixed(2))}`;
        let lm_net = document.createElement('div');
        lm_net.style.display = a.types.includes('B') ? 'block' : 'none';
        lm_net.textContent = a.surplus ? `${rev_mo} surplus: $${insertCommas(a.surplus.toFixed(2))}` : a.deficit ? `${rev_mo} deficit: $${insertCommas(a.deficit.toFixed(2))}` : a.closed ? `${rev_mo} closed to P/L`: `${rev_mo} surplus / deficit: --`;
        lmEl.append(lm_cash, lm_net);
        
        let nmEl = mkc('eom_next_month');
        nmEl.style.display = a.types.includes('B') && !a.closed ? 'block' : 'none';
        let nm_bud_wrap = mk();
        let nm_bud_lbl = mkc('nm_bud_lbl', 'label');
        nm_bud_lbl.textContent = `${nxt_mo} budget: `
        let nm_bud = mkc('nm_bud', 'input');
        nm_bud.type = 'number';
        nm_bud.step = '0.01';
        nm_bud.value = a.budgeted_amt ? a.budgeted_amt : 0;
        nm_bud.min = '0';
        nm_bud.max = '9999';
        if (a.closed) nm_bud.disabled = true;
        nm_bud_wrap.append(nm_bud_lbl, nm_bud);
        nmEl.append(nm_bud_wrap);
        if (a.types.includes('E') && a.deficit && a.budgeted_amt > 0 && !a.closed) {
            let adjBud = mkc('nm_adj_bud', 'button');
            adjBud.textContent = `Cut by ${a.budgeted_amt && a.budgeted_amt > a.deficit ? a.budgeted_amt - a.deficit : a.budgeted_amt}`;
            nmEl.append(adjBud);
        }
        let nm_rollover = document.createElement('div');
        nm_rollover.style.display = a.types.includes('E') ? 'block' : 'none';
        let nm_ro_lbl = document.createElement('label');
        nm_ro_lbl.textContent = `Rollover to ${nxt_mo}: `;
        let rollover = mkc('eom_nm_ro', 'input');
        rollover.type = 'number';
        rollover.step = '0.01';
        rollover.value = a.rollover_amt;
        rollover.min = '0';
        rollover.max = a.surplus ? a.surplus : '0';
        rollover.disabled = !a.surplus || a.closed;
        nm_rollover.append(nm_ro_lbl, rollover);
        let adjRo = mkc('adj_ro_btn', 'button');
        adjRo.textContent = `Roll over ${a.surplus}`;
        adjRo.style.display = a.surplus && !a.closed ? 'inline' : 'none';
        nm_rollover.append(adjRo);
        nmEl.append(nm_rollover);

        eom_div.append(lmEl, nmEl);
        let div = getLedgerLine(acct, a);
        div.dataset.prevbudget = a.budgeted_amt ? a.budgeted_amt.toFixed(2) : '0';
        div.dataset.prevrollover = a.rollover_amt ? a.rollover_amt.toFixed(2) : '0';
        let target;
        for (const el of div.children) if (el.classList.contains('ledger_summary')) target = el;
        target.after(eom_div);
        eom_rev.append(div);
    }
    let eom_summary = mkc('eom_summary');
    let eom_summ_lm = mkc('eom_summary_last_month');
    let lmo = mkc('eom_summary_month');
    lmo.textContent = `${rev_mo} ${y}:`;
    let lm_summ = mk();
    let lm_bud = mk();
    lm_bud.textContent = `Budgeted: $${insertCommas(ledger.budget_lm.toFixed(2))}`;
    let lm_roll = mk();
    lm_roll.textContent = `Rolled over: $${insertCommas(ledger.rollover_lm.toFixed(2))}`;
    let lm_spent = mk();
    lm_spent.textContent = `Spent: $${insertCommas(ledger.spent.toFixed(2))}`;
    let lm_earned = mk();
    lm_earned.textContent = `Earned: $${insertCommas(ledger.earned.toFixed(2))}`;
    lm_summ.append(lm_bud, lm_roll, lm_spent, lm_earned);
    eom_summ_lm.append(lmo, lm_summ);
    let eom_summ_nm = mkc('eom_summary_next_month');
    let nmo = mkc('eom_summary_month');
    nmo.textContent = `${nxt_mo} ${m == 12 ? parseInt(y) + 1 : y}:`
    let nm_summ = mk();
    let nm_budgeted = mk();
    nm_budgeted.id = 'eom_summary_next_month_budgeted';
    nm_budgeted.textContent = `Budgeted expenses: $${insertCommas(ledger.budget_nm.toFixed(2))}`;
    let nm_projected = mk();
    nm_projected.id = 'eom_summary_next_month_projected';
    nm_projected.textContent = `Projected income: $${insertCommas(ledger.projected_amt.toFixed(2))}`;
    nm_summ.append(nm_budgeted, nm_projected);
    eom_summ_nm.append(nmo, nm_summ);
    eom_summary.append(eom_summ_lm, eom_summ_nm);
    let eom_submit = mkc('eom_submit', 'button');
    eom_submit.style.display = ledger.spent || ledger.earned || ledger.budget_lm || ledger.rollover_lm || ledger.budget_nm || ledger.projected_amt ? 'inline' : 'none';
    eom_submit.textContent = `Submit ${ledger.spent || ledger.earned || ledger.budget_lm || ledger.rollover_lm ? `${rev_month} ${y} P&L` : '' } ${(ledger.spent || ledger.earned || ledger.budget_lm || ledger.rollover_lm) && (ledger.budget_nm || ledger.projected_amt) ? 'and ' : ''}${ledger.budget_nm || ledger.projected_amt ? `${nxt_month} ${m == 12 ? y + 1 : y} opening budget` : ''}`;
    eom_summary.append(eom_submit);
    eom_rev.append(eom_summary);
}

async function submitEom() {
    isSignedIn(async () => {
        let m = eom_ledger.m;
        let y = eom_ledger.y;
        const last_date_of_rev_month = new Date(y, m, 0);
        const ld = last_date_of_rev_month.getDate();
        const first_date_of_next_month = new Date(y, m, 1);
        const ny = first_date_of_next_month.getFullYear();
        const nm = first_date_of_next_month.getMonth() + 1;
    
        let closing_entries = [];
        let opening_entries = [];
        for (const name in eom_ledger.accts) {
            let a = eom_ledger.accts[name];
            if (a.closed) {
                continue;
            }
            let closing_debit, closing_credit;
            const debit = a.debit;
            const credit = a.credit;
            if (debit > credit) {
                closing_credit = debit - credit;
            } else if (credit > debit) {
                closing_debit = credit - debit;
            }
            if (debit != credit) {
                closing_entries.push(
                    [y, m, ld, `CLOSING ENTRY ${name} to Income Summary`, name, closing_debit, closing_credit],
                    [y, m, ld, `CLOSING ENTRY ${name} to Income Summary`, 'Income Summary', closing_credit, closing_debit]    
                )
            }
    
            const opening_budget = a.budgeted_amt;
            if (opening_budget > 0) {
                if (a.types.includes('R')) { // income account: budget is debited
                    opening_entries.push(
                        [ny, nm, 1, `OPENING ENTRY Budget to ${name}`, name, opening_budget, ''],
                        [ny, nm, 1, `OPENING ENTRY Budget to ${name}`, 'Budget', '', opening_budget]
                    )
                } else if (a.types.includes('E')) { // expense account: budget is credited
                    opening_entries.push(
                        [ny, nm, 1, `OPENING ENTRY Budget to ${name}`, name, '', opening_budget],
                        [ny, nm, 1, `OPENING ENTRY Budget to ${name}`, 'Budget', opening_budget, '']
                    )
                }
            }
    
            // Opening Entry Retained Earnings > acct
            if (a.types.includes('E')) {
                const opening_rollover = a.rollover_amt;
                if (opening_rollover > 0) { // expense account: rollover is credited
                    opening_entries.push(
                        [ny, nm, 1, `OPENING ENTRY Retained Earnings to ${name}`, name, '', opening_rollover],
                        [ny, nm, 1, `OPENING ENTRY Retained Earnings to ${name}`, 'Retained Earnings', opening_rollover, '']
                    )
                }
            }
        }
    
        // generate closing entry Income Summary > Retained Earnings
        let income_summary = 0;
        for (const e of closing_entries) {
            if (e[4] == 'Income Summary') {
                if (e[5]) {
                    income_summary -= parseFloat(e[5])
                } else if (e[6]) {
                    income_summary += parseFloat(e[6])
                }
            }
        }
        if (income_summary > 0) { // income_summary is credit
            closing_entries.push(
                [y, m, ld, 'CLOSING ENTRY Income Summary to Retained Earnings', 'Income Summary', income_summary.toFixed(2), ''],
                [y, m, ld, 'CLOSING ENTRY Income Summary to Retained Earnings', 'Retained Earnings', '', income_summary.toFixed(2)]
            )
        } else if (income_summary < 0) { // income summary is debit
            income_summary = income_summary * -1;
            closing_entries.push(
                [y, m, ld, 'CLOSING ENTRY Income Summary to Retained Earnings', 'Income Summary', '', income_summary.toFixed(2)],
                [y, m, ld, 'CLOSING ENTRY Income Summary to Retained Earnings', 'Retained Earnings', income_summary.toFixed(2), '']
            )
        }
    
        try {
            // append closing entries to journal
            if (closing_entries.length > 0) {
                appendValues(ssid, "Journal!A1", 'RAW', closing_entries);
            }
            // append opening entries to journal
            if (opening_entries.length > 0) {
                appendValues(ssid, "Journal!A1", 'RAW', opening_entries);
            }
            // update display to closed
            if (closing_entries.length > 0) {
                flash(`${closing_entries.length / 2 - 1} account(s) closed for ${months[m - 1]} ${y}${opening_entries.length > 0 ? `; budget opened for ${opening_entries.length / 2} accounts for ${nxt_month} ${ny}` : ''}`);
            }
            bha_sync();
            eom_ledger = getEomLedger(m, y);
            popEomDisplay(eom_ledger);
        } catch(err) {
            flash('Error: ' + err.message);
        }    
    })
}

function adjNMBud(ledger_line) {
    let acct = ledger_line.dataset.acct;
    let a = eom_ledger[acct];
    let cut_amt = a.budgeted_amt && a.budgeted_amt > a.deficit ? a.budgeted_amt - a.deficit : 0;
    let els = getLedgerLineEls(ledger_line);
    els.budget.value = cut_amt;
    NMBudgetChanged(ledger_line)
}

function rolloverSurplus(ledger_line) {
    let acct = ledger_line.dataset.acct;
    let a = eom_ledger[acct];
    let els = getLedgerLineEls(ledger_line);
    els.rollover.value = a.surplus;
    NMRolloverChanged(ledger_line);
}

function updateEomSummary() {
    document.getElementById('eom_summary_next_month_budgeted').textContent = `Budgeted expenses: $${insertCommas((eom_ledger.budgeted_amt + eom_ledger.rollover_amt).toFixed(2))}`;
    document.getElementById('eom_summary_next_month_projected').textContent = `Projected income: $${insertCommas(eom_ledger.projected_amt.toFixed(2))}`;
}

function NMBudgetChanged(ledger_line) {
    let acct = ledger_line.dataset.acct;
    let prev_budget = parseFloat(ledger_line.dataset.prevbudget);
    let els = getLedgerLineEls(ledger_line);
    let budget = parseFloat(els.budget.value);
    eom_ledger.accts[acct].budgeted_amt = budget.toFixed(2);
    let difference = budget - prev_budget;
    if (eom_ledger.accts[acct].types.includes('E')) {
        eom_ledger.budgeted_amt = parseFloat((eom_ledger.budgeted_amt + difference).toFixed(2));
    } else if (eom_ledger.accts[acct].types.includes('R')) {
        eom_ledger.projected_amt = parseFloat((eom_ledger.projected_amt + difference).toFixed(2));
    }
    updateEomSummary();
    if (els.hasOwnProperty('adj_bud_btn')) {
        els.adj_bud_btn.remove();
    }
    ledger_line.dataset.prevbudget = budget;
}

function NMRolloverChanged(ledger_line) {
    let acct = ledger_line.dataset.acct;
    let prev_rollover = parseFloat(ledger_line.dataset.prevrollover);
    let els = getLedgerLineEls(ledger_line);
    let rollover = parseFloat(els.rollover.value);
    eom_ledger.accts[acct].rollover_amt = rollover.toFixed(2);
    let difference = rollover - prev_rollover;
    eom_ledger.rollover_amt = parseFloat((eom_ledger.rollover_amt + difference).toFixed(2));
    updateEomSummary();
    if (els.hasOwnProperty('rollover_btn')) {
        els.rollover_btn.remove();
    }
    ledger_line.dataset.prevrollover = rollover;
}

let eomClickHandler = function(e) {
    if (e.target.classList.contains('nm_adj_bud')) {
        let ledger_line = e.target.parentElement.parentElement.parentElement;
        console.log(ledger_line);
        adjNMBud(ledger_line);
    } else if (e.target.classList.contains('adj_ro_btn')) {
        let ledger_line = e.target.parentElement.parentElement.parentElement.parentElement;
        rolloverSurplus(ledger_line);
    } else if (e.target.classList.contains('eom_submit')) {
        submitEom();
    }
    
}

let eomChangeHandler = function(e) {
    if (e.target.classList.contains('nm_bud')) {
        let ledger_line = e.target.parentElement.parentElement.parentElement.parentElement;
        NMBudgetChanged(ledger_line);
    } else if (e.target.classList.contains('eom_nm_ro')) {
        let ledger_line = e.target.parentElement.parentElement.parentElement.parentElement;
        NMRolloverChanged(ledger_line);
    }
}

// END MODULE EOM Review BEGIN MODULE general setup

function populatePrevSSIDs() {
    const prevSSIDsSelect = document.getElementById('open_journal_select');
    while (prevSSIDsSelect.firstChild) prevSSIDsSelect.firstChild.remove();
    const firstOpt = mk('option');
    firstOpt.textContent = 'select journal name...'
    firstOpt.value = '';
    prevSSIDsSelect.append(firstOpt);
    for (const id in prevSSIDs) {
        let opt = document.createElement('option');
        opt.value = id;
        opt.textContent = prevSSIDs[id];
        prevSSIDsSelect.append(opt);
    }
    document.getElementById('remove_saved_ssid').style.display = 'none';
    if (Object.keys(prevSSIDs).length > 1) {
        document.getElementById('setup_previous_journals').style.display = 'block';
    } else {
        document.getElementById('setup_previous_journals').style.display = 'none';
    }

}

function editJournalName(target) {
    isSignedIn(() => {
        document.getElementById('journal_name').disabled = false;
        target.style.display = 'none';
        document.getElementById('cancel_edit_journal_name').style.display = 'inline';
        document.getElementById('save_journal_name').style.display = 'inline';
    });
}

function cancelEditJournalName(target) {
    document.getElementById('journal_name').disabled = true;
    target.style.display = 'none';
    document.getElementById('edit_journal_name').style.display = 'inline';
    document.getElementById('save_journal_name').style.display = 'none';
}

function prevSSIDSelectChanged(target) {
    if (target.value) {
        let input = document.getElementById('ssid');
        input.value = target.value;
        validateSSID(input);
        document.getElementById('remove_saved_ssid').style.display = 'inline';
    } else {
        document.getElementById('remove_saved_ssid').style.display = 'none';
    }
}

function checkAcceptLicense(callback) {
    if (localStorage.getItem('accepted_terms') == 'true') {
        callback();
    } else {
        const confirmation = mk('span');
        const s1 = mk('span');
        s1.textContent = 'By continuing, you accept the ';
        const terms = mk('a');
        terms.textContent = 'terms of use';
        terms.title = 'terms of use';
        terms.href = 'LICENSE.txt';
        const s2 = mk('span');
        s2.textContent = ' and ';
        const priv = mk('a');
        priv.textContent = 'privacy policy';
        priv.href = 'privacy-policy.html';
        confirmation.append(s1, terms, s2, priv);
        flash(confirmation, () => {
            localStorage.setItem('accepted_terms', 'true');
            callback();
        });
    }
    
}

function saveSsid() {
    isSignedIn(() => {
        checkAcceptLicense(async () => {  // don't delete prevSSIDs
            localStorage.removeItem('spreadsheetID');
            localStorage.removeItem('spreadsheet_properties');
            localStorage.removeItem('last_sync');
            localStorage.removeItem('journal');
            localStorage.removeItem('account_list');
            localStorage.removeItem('rcrgs');
            localStorage.removeItem('lastPageViewed');
            localStorage.removeItem('entryQueue');
            ssid = document.getElementById('ssid').value;
            if (!ssid) {
                flash('Spreadsheet ID cannot be blank');
                return;
            } else {
                localStorage.setItem('spreadsheetID', ssid);
            }
            try {
                await bha_sync();
                flash(`Synced to spreadsheet ID ${ssid}`);
                updateEntryOpts(document.getElementById('add_entry').firstChild, 'exp');
                goToPage('add_entry');
            } catch(err) {
                flash('Error: ' + err.toString());
                console.log(err);
                return;
            }
        });
    });
}

function createSpreadsheet() {
    isSignedIn(() => {
        checkAcceptLicense(async () => {
            let template = document.getElementById('new_ss_templates').value;
            let templateValues;
            if (!template) {
                templateValues = [
                    ['Name','Account type(s)','Parent','Monthly Budget'], 
                    ['Assets', 'A'],
                    ['Liabilities', 'L'],
                    ['Equity', 'Q'],
                    ['Expenses', 'E'],
                    ['Revenue', 'R']
                ];
            } else if (template == 'home') {
                templateValues = [
                    ['Name','Account type(s)','Parent','Monthly Budget'], 
                    ['Assets', 'A'],
                    ['Cash accounts', 'A', 'Assets'],
                    ['Cash on hand', 'AP', 'Cash accounts'],
                    ['Checking account', 'AP', 'Cash accounts'],
                    ['Venmo account', 'AP', 'Cash accounts'],
                    ['Savings account', 'A', 'Cash accounts'],
                    ['Liabilities', 'L'],
                    ['Credit card', 'LP', 'Liabilities'],
                    ['Vehicle loan', 'L', 'Liabilities'],
                    ['Equity', 'Q'],
                    ['Retained Earnings', 'Q', 'Equity'],
                    ['Income Summary', 'Q', 'Equity'],
                    ['Budget', 'Q', 'Equity'],
                    ['Expenses', 'E'],
                    ['Home & personal', 'EBD', 'Expenses'],
                    ['Clothing', 'EBD', 'Home & personal'],
                    ['Medical care', 'EBD', 'Home & personal'],
                    ['Health & Beauty', 'EBD', 'Home & personal'],
                    ['Food', 'EBD', 'Expenses'],
                    ['Groceries', 'EBD', 'Food'],
                    ['Eating out', 'EBD', 'Food'],
                    ['Giving', 'E', 'Expenses'],
                    ['Christmas gifts', 'EBD', 'Giving'],
                    ['Vehicle', 'E', 'Expenses'],
                    ['Gas', 'EBD', 'Vehicle'],
                    ['Car insurance', 'EBS', 'Vehicle'],
                    ['Car maintenance', 'EBS', 'Vehicle'],
                    ['Car loan interest', 'E', 'Vehicle'],
                    ['Utilities', 'E', 'Expenses'],
                    ['Rent', 'EBS', 'Utilities'],
                    ['Cell phone', 'EBS', 'Utilities'],
                    ['Electric', 'EBD', 'Utilities'],
                    ['Water', 'EBD', 'Utilities'],
                    ['Internet & TV', 'EBS', 'Utilities'],
                    ['Trash', 'EBS', 'Utilities'],
                    ['Gas (house)', 'EBS', 'Utilities'],
                    ['Insurance', 'E', 'Expenses'],
                    ['Health insurance', 'EBS', 'Insurance'],
                    ['Home/renter\'s insurance', 'EBS', 'Insurance'],
                    ['Fun', 'E', 'Expenses'],
                    ['Entertainment', 'EBD', 'Fun'],
                    ['Hobbies', 'EBD', 'Fun'],
                    ['Vacation', 'EBD', 'Fun'],
                    ['Revenue', 'R'],
                    ['Employment income', 'RB', 'Revenue'],
                    ['Other income', 'RB', 'Revenue'],
                    ['Gifts from others', 'R', 'Revenue'],
                ];
            } else if (template == 'estate') {
                templateValues = [
                    ['Name','Account type(s)','Parent','Monthly Budget'], 
                    ['Assets', 'A'],
                    ['Cash accounts', 'A', 'Assets'],
                    ['Cash on hand', 'AP', 'Cash accounts'],
                    ['Checking account', 'AP', 'Cash accounts'],
                    ['Stocks and Bonds', 'A', 'Assets'],
                    ['Mortgages and Notes', 'A', 'Assets'],
                    ['Real Estate', 'A', 'Assets'],
                    ['Miscellaneous assets', 'A', 'Assets'],
                    ['Firearms', 'A', 'Assets'],
                    ['Liabilities', 'L'],
                    ['Equity', 'Q'],
                    ['Distributions to beneficiaries', 'Q', 'Equity'],
                    ['Expenses', 'E'],
                    ['Interest expense', 'E', 'Expenses'],
                    ['Taxes', 'E', 'Expenses'],
                    ['Fiduciary fees', 'E', 'Expenses'],
                    ['Attorney, accountant, tax prep. fees', 'E', 'Expenses'],
                    ['Revenue', 'R'],
                    ['Receipts', 'R', 'Revenue'],
                    ['Insurance payable to Estate', 'R', 'Revenue'],
                    ['IRAs, 401Ks payable to Estate', 'R', 'Revenue'],
                    ['Interest income', 'R', 'Revenue'],
                    ['Dividends', 'R', 'Revenue'],
                    ['Capital gain', 'R', 'Revenue']
                ];
            }
        
            let creation_response, result;
            try {
                creation_response = await gapi.client.sheets.spreadsheets.create({
                    properties: {
                        title: 'Untitled journal: Baker home accounting'
                    },
                    sheets: [{
                        properties: {
                            title: 'Journal'
                        }}, {
                        properties: {
                            title: 'Account List'
                        }}, {
                        properties: {
                            title: 'Recurring Entries'
                        }}]
                })
            } catch(err) {
                flash(err.message);
            }
            result = creation_response.result;
        
            localStorage.removeItem('spreadsheetID');
            localStorage.removeItem('spreadsheet_properties');
            localStorage.removeItem('last_sync');
            localStorage.removeItem('journal');
            localStorage.removeItem('account_list');
            localStorage.removeItem('rcrgs');
            localStorage.removeItem('lastPageViewed');
            localStorage.removeItem('entryQueue');
            ssid = result.spreadsheetId;
            localStorage.setItem('spreadsheetID', ssid);
        
            try {
                response = await gapi.client.sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: ssid,
                    resource: {
                        // this value for data is where we will put the different templates
                        data: [{
                            range: 'Journal!A1',
                            values: [['Date','Description','Account','Debit','Credit']]
                        },{
                            range:'Account List!A1',
                            values: templateValues
                        },{
                            range:'Recurring Entries!A1',
                            values: [['on / every', 'interval (#)', 'period', 'Description', 'Account', 'Debit', 'Credit']]
                        }],
                        valueInputOption: 'RAW'
                    },
                });
            } catch (err) {
                flash(err.message);
            }
        
            await bha_sync();
            flash(`New journal created${template ? ' from ' + template + ' template.' : '.'}`);
            updateEntryOpts(document.getElementById('add_entry').firstChild, 'exp');
            goToPage('add_entry');
        });})
}

async function saveJournalName(name) {
    isSignedIn(async () => {
        try {
            let response;
            response = await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: ssid,
                requests: [{
                    updateSpreadsheetProperties: {
                        /* reference:
                        {
                            "properties": {
                                "title": string,
                                "locale": string,
                                "autoRecalc": enum (RecalculationInterval),
                                "timeZone": string,
                                "defaultFormat": { object (CellFormat) },
                                "iterativeCalculationSettings": { object (IterativeCalculationSettings) },
                                "spreadsheetTheme": { object (SpreadsheetTheme) },
                                "importFunctionsExternalUrlAccessAllowed": boolean
                            },
                            "fields": string
                        }
                        */
                        properties: {
                            title: name,
                        },
                        fields: 'title'
                    }
                }]
            });
            document.getElementById('journal_name').disabled = true;
            document.getElementById('edit_journal_name').style.display = 'inline';
            document.getElementById('cancel_edit_journal_name').style.display = 'none';
            document.getElementById('save_journal_name').style.display = 'none';
            bha_sync();
        } catch(err) {
            flash(err.message);
            return;
        }

    })
}

function validateSSID(input) {
    let val = input.value;
    if (val.includes('d/') && val.includes('/edit')) {
        let newVal = val.substring(val.indexOf('d/') + 2, val.indexOf('/edit'));
        input.value = newVal;
    }
    input.size = input.value.length > 20 ? input.value.length : 20;
    if (val === '') {
        document.getElementById('open_journal_btn').disabled = true;
    } else {
        document.getElementById('open_journal_btn').disabled = false;
    }
}

function validatePastedSSID(event) {
    let url = event.clipboardData.getData('text/plain');
    event.preventDefault();
    if (url.includes('d/') && url.includes('/edit')) url = url.substring(url.indexOf('d/') + 2, url.indexOf('/edit'));
    event.target.value = url;
    document.getElementById('open_journal_btn').disabled = false;
}

function removeSsid() {
    let ssidToRemove = document.getElementById('open_journal_select').value;
    let message = mk('span');
    message.textContent = `"${prevSSIDs[ssidToRemove]}" will be removed from the list. To delete the journal, do so `;
    let link = mk('a');
    link.textContent = 'in Google Sheets';
    link.title = 'link to journal in Google Sheets';
    link.href = `https://docs.google.com/spreadsheets/d/${ssidToRemove}/edit`;
    message.append(link);
    flash(message, () => {
        delete prevSSIDs[ssidToRemove];
        localStorage.setItem('prevSSIDs', JSON.stringify(prevSSIDs));
        populatePrevSSIDs();
    });
}

function saveSigninChanged(target) {
    if (target.checked) {
        localStorage.setItem('gapiToken', gapi.client.getToken().access_token);
        localStorage.setItem('gapiTokenExp', tokenExpirationInMS);
        if (rcrgs.length > 0) localStorage.setItem('rcrgs', JSON.stringify(rcrgs));
        if (accts.length > 0) localStorage.setItem('account_list', JSON.stringify(accts));
        if (journal.length > 0) localStorage.setItem('journal', JSON.stringify(journal));
    } else {
        localStorage.removeItem('gapiToken');
        localStorage.removeItem('journal');
        localStorage.removeItem('account_list');
        localStorage.removeItem('rcrgs');
    }
}

let setupClickHandler = function(e) {
    if (e.target.id == 'edit_journal_name') {
        editJournalName(e.target);
    } else if (e.target.id == 'cancel_edit_journal_name') {
        cancelEditJournalName(e.target);
    } else if (e.target.id == 'save_journal_name') {
        let name = document.getElementById('journal_name').value;
        saveJournalName(name);
    } else if (e.target.id == 'new_ss') {
        createSpreadsheet();
    } else if (e.target.id == 'open_journal_btn') {
        saveSsid();
    } else if (e.target.id == 'remove_saved_ssid') {
        removeSsid();
    }
}

let setupChangeHandler = function(e) {
    if (e.target.id == 'open_journal_select') {
        prevSSIDSelectChanged(target);
    } else if (e.target.id == 'ssid') {
        validateSSID(e.target);
    } else if (e.target.id == 'save_signin') {
        saveSigninChanged(target);
    }
}

const setupPasteHandler = function(e) {
    if (e.target.id == 'ssid') {
        validatePastedSSID(e);
    }
}
// END MODULE general setup

// BEGIN CODE TO EXECUTE ONLOAD

if (ssprops) {
    document.getElementById('top_title').textContent = ssprops.properties.title;
    document.getElementById('journal_name').value = ssprops.properties.title;
    document.getElementById('journal_name').size = ssprops.properties.title.length > 20 ? ssprops.properties.title.length : 20;
    document.getElementById('edit_journal_name').disabled = false;
    document.getElementById('spreadsheet_link').href = `https://docs.google.com/spreadsheets/d/${ssid}/edit`
    document.getElementById('nav_menu').disabled = false;
    document.getElementsByTagName('title')[0].textContent = ssprops.properties.title + ': \u0071\u035C\u0298';
    let lastPageViewed = localStorage.getItem('lastPageViewed');
    if (lastPageViewed) {
        goToPage(lastPageViewed);
    } else {
        goToPage('add_entry');
    }
}

if (localStorage.getItem('last_sync')) {
    document.getElementById('last_sync').textContent = `synced ${localStorage.getItem('last_sync')} `
}

populatePrevSSIDs();

if (localStorage.getItem('entryQueue')) {
    queue = JSON.parse(localStorage.getItem('entryQueue'));
    flash(queue.length + ' journal entry lines waiting. Sign in to upload.')
}

newBlankEntry('exp');

document.getElementById('navbar').addEventListener('click', navbarClickHandler);
document.getElementById('navbar').addEventListener('change', navbarChangeHandler);
document.getElementById('content').addEventListener('click', addEntryClickHandler);
document.getElementById('content').addEventListener('change', addEntryChangeHandler);
document.getElementById('content').addEventListener('focus', addEntryFocusHandler);
document.getElementById('content').addEventListener('click', ledgersClickHandler);
document.getElementById('content').addEventListener('change', ledgersChangeHandler)
document.getElementById('content').addEventListener('click', journalClickHandler);
document.getElementById('content').addEventListener('click', eomClickHandler);
document.getElementById('content').addEventListener('change', eomChangeHandler);
document.getElementById('content').addEventListener('click', rcrgClickHandler);
document.getElementById('content').addEventListener('change', rcrgChangeHandler);
document.getElementById('content').addEventListener('click', editAcctClickHandler);
document.getElementById('content').addEventListener('change', editAcctChangeHandler);
document.getElementById('setup').addEventListener('click', setupClickHandler);
document.getElementById('setup').addEventListener('change', setupChangeHandler);
document.getElementById('setup').addEventListener('paste', setupPasteHandler);
