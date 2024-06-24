const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited;
let gisInited;
let today;

//let tokenExpirationInMS;
let tokenExpirationInMS = localStorage.getItem('gapiTokenExp') ? parseInt(localStorage.getItem('gapiTokenExp')) : 0; // this might break their rules. Can i keep the hourlong token in localStorage? If not, can I do it if I add a "keep my signed in" option that is unchecked by default?

document.getElementById('google_signin_btn').style.display = 'none';
document.getElementById('sync_btn').style.display = 'none';
document.getElementById("signout_btn").style.display = 'none';

function checkBeforeStart() {
    if (gapiInited && gisInited && today){
      document.getElementById('google_signin_btn').style.display = 'inline';
      // FOR DEV ONLY - DOES IT BREAK THEIR NEW RULES?
      if (localStorage.getItem('gapiToken')) {
        document.getElementById('save_signin').checked = true;
      }
      if (localStorage.getItem('gapiTokenExp')) {
          if (today.getTime() < parseInt(localStorage.getItem('gapiTokenExp'))) { // I'm assuming it takes longer to init gapi and gis than for the browser to get to the beginning of bha-scripts.js, where today is defined.
              gapi.client.setToken({access_token : localStorage.getItem('gapiToken')});
              updateInterfaceForSignin();
          } else {
            localStorage.removeItem('gapiTokenExp');
          }
      }
      // END FOR DEV ONLY
    }
}

today = new Date();
checkBeforeStart();

function gapiInit() {
  gapi.client.init({
    apiKey: API_KEY,
  })
  .then(function() {  
    gapi.client.load(DISCOVERY_DOC);
    gapiInited = true;
    checkBeforeStart();
  });
}

function gapiLoad() {
    gapi.load('client', gapiInit)
}

function gisInit() {
  tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '',  // defined at request time
            error_callback: catchSigninFailure,
        });
  gisInited = true;
  checkBeforeStart();
}

async function handleConnectClick() {
  if (isSignedIn()) {
    await bha_sync();
    resetViewsAfterSync();
  } else {
    tokenClient.callback = async (resp) => {
      if (resp.error !== undefined) {
        throw(resp);
      }
      await justGotToken();
      resetViewsAfterSync();
    }
    tokenClient.requestAccessToken();
  }
}

function revokeToken() {
  localStorage.removeItem('gapiTokenExp');
  let cred = gapi.client.getToken();
  if (cred !== null) {
    google.accounts.oauth2.revoke(cred.access_token, () => {console.log('Revoked: ' + cred.access_token)});
    gapi.client.setToken('');
  }
  updateInterfaceForSignout();
}

async function justGotToken() {
  let now = new Date();
  tokenExpirationInMS = now.getTime() + gapi.client.getToken().expires_in * 1000;
  
  // FOR DEV ONLY does it break their new rules?
  if (localStorage.getItem('gapiToken')) {
    localStorage.setItem('gapiToken', gapi.client.getToken().access_token);
    localStorage.setItem('gapiTokenExp', tokenExpirationInMS);
  }
  // END FOR DEV ONLY

  if (ssprops) {
      await uploadEntryQueue();
      await bha_sync();
  }
  updateInterfaceForSignin();
}

function isSignedIn(callback) { // returns true/false as well, can be used without the callback. Can't do Async because oauth2's requestAccessToken() doesn't return a promise
  let now = new Date();
  let notSignedIn;
  if (!gapi.client.getToken()) {
      notSignedIn = true;
  } else if (now.getTime() > tokenExpirationInMS) {
      gapi.client.setToken('');
      localStorage.removeItem('gapiToken');
      localStorage.removeItem('gapiTokenExp');
      updateInterfaceForSignout();
      notSignedIn = true;
  } 
  if (notSignedIn) {
      if (callback !== undefined) {
          flash('Must be signed in. Sign in now?', () => {
            tokenClient.callback = (resp) => {
                if (resp.error !== undefined) {
                    return false;
                }
                justGotToken();
                callback();
                tokenClient.callback = (resp) => { // reset to the normal callback in case the requestaccesstoken function gets called without first redefining another callback. Could make weird stuff happen.
                    if (resp.error !== undefined) {
                        throw(resp);
                    }
                    justGotToken();
                }
                return true;
            }
            tokenClient.requestAccessToken();
          }, () => {return false});
      } else {
          return false;
      }
  } else {
      if (callback) callback();
      return true;
  }
}

async function bha_sync() {
  if (!ssid) throw new Error('Unable to sync - missing spreadsheet ID');
  today = new Date();
  let ssprops_response;
  try {
      ssprops_response = await gapi.client.sheets.spreadsheets.get({
          spreadsheetId: ssid, 
          ranges: [
              "Journal!A1", 
              "Account List!A1", 
              "Recurring Entries!A1"
          ]
      });
  } catch (err) {
      flash('error: ' + err.toString());
      console.log(err);
      return;
  }
  ssprops = ssprops_response.result;
  localStorage.setItem('spreadsheet_properties', JSON.stringify(ssprops));

  if (!prevSSIDs.hasOwnProperty(ssid)) {
      prevSSIDs[ssid] = ssprops.properties.title;
      localStorage.setItem('prevSSIDs', JSON.stringify(prevSSIDs));
  } else if (prevSSIDs[ssid] != ssprops.properties.title) {
      prevSSIDs[ssid] = ssprops.properties.title;
      localStorage.setItem('prevSSIDs', JSON.stringify(prevSSIDs));
  }

  updateInterfaceForSignin();

  // fetch the whole spreadsheet
  let response;
  try {
      response = await gapi.client.sheets.spreadsheets.values.batchGet({
          spreadsheetId: ssid,
          ranges: ['Account List!A2:D','Journal!A2:E','Recurring Entries!A2:G'],
      });
  } catch (err) {
      flash(err.message);
      return;
  }
  const result = response.result;
  if (!result || !result.valueRanges || result.valueRanges.length == 0) {
      flash('No values found.');
      return;
  }

  let lastSync = `${mos[today.getMonth()]} ${today.getDate()}`;
  document.getElementById('last_sync').textContent = `synced ${lastSync} `;

  journal = result.valueRanges[1].values ? result.valueRanges[1].values : [];
  
  accts = result.valueRanges[0].values ? result.valueRanges[0].values : [];

  rcrgs = result.valueRanges[2].values ? result.valueRanges[2].values : [];

  eom_ledger = {};

  if (localStorage.getItem('offlineOpt')) {
    // FOR DEVELOPMENT ONLY, need to stress test:
    localStorage.setItem('journal', JSON.stringify(journal ? journal : []));
    // END FOR DEVELOPMENT ONLY
    localStorage.setItem('account_list', JSON.stringify(accts));
    localStorage.setItem('rcrgs', JSON.stringify(rcrgs));
    localStorage.setItem('last_sync', lastSync);
  }
}

function catchSigninFailure(err) {
  if (err.type == 'popup_failed_to_open') {
    flash('Try disabling your popup blocker.');
  } else if (err.type == 'popup_closed') {
    for (const entry_acct of [...document.getElementsByClassName('deb_acct'), ...document.getElementsByClassName('cred_acct')]) {
      if (entry_acct.value == '***') {
        entry_acct.value = '';
        break;
      }
    }
  }
}

async function resetViewsAfterSync() {
  updateEntryOpts(document.getElementById('add_entry').firstChild, JSON.parse(document.getElementById('add_entry').firstChild.dataset.origentry).type ? JSON.parse(document.getElementById('add_entry').firstChild.dataset.origentry).type : '');
  while (document.getElementById('ledgers_display').firstChild) document.getElementById('ledgers_display').firstChild.remove();
  while (document.getElementById('journal').firstChild) document.getElementById('journal').firstChild.remove();
  while (document.getElementById('eom_rev').firstChild) document.getElementById('eom_rev').firstChild.remove();
  populateRcrg();
  populateEditAccts();
}

function updateInterfaceForSignin() {
  document.getElementById('setup_save_signin').style.display = 'block';
  document.getElementById('google_signin_btn').style.display = 'none';
  document.getElementById('signout_btn').style.display = 'inline';
  if (ssprops) {
      document.getElementById('sync_btn').style.display = 'inline';
      document.getElementById('top_title').textContent = ssprops.properties.title;
      document.getElementById('navbar').style.display = 'flex';
      document.getElementById('splash').style.display = 'none';
      document.getElementById('setup_journal_name').style.display = 'block';
      document.getElementById('journal_name').value = ssprops.properties.title;
      document.getElementById('journal_name').size = ssprops.properties.title.length > 20 ? ssprops.properties.title.length : 20;
      document.getElementById('edit_journal_name').disabled = false;
      document.getElementById('spreadsheet_link').href = ssprops.spreadsheetUrl;
      document.getElementsByTagName('title')[0].textContent = ssprops.properties.title + ': \u0071\u035C\u0298';
      populatePrevSSIDs();
  }
}

function updateInterfaceForSignout() {
  document.getElementById('sync_btn').style.display = 'none';
  document.getElementById('signout_btn').style.display = 'none';
  document.getElementById('setup_save_signin').style.display = 'none';
  document.getElementById('google_signin_btn').style.display = 'inline';
}
