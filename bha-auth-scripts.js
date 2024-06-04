const CLIENT_ID = '631343190646-218if241hhb0m2dj8ems1rk0kjo80kb6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDo1dk4O8NDOw1gTpeWxnl6x2_NFIM2qvQ';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited;
let gisInited;

document.getElementById("connect_btn").style.display = 'none';
document.getElementById("disconnect_btn").style.display = 'none';

function checkBeforeStart() {
    if (gapiInited && gisInited){
      // Start only when both gapi and gis are initialized.
      document.getElementById("connect_btn").style.display = 'inline';
    }
}

function gapiInit() {
  gapi.client.init({
    apiKey: API_KEY,
    // NOTE: OAuth2 'scope' and 'client_id' parameters have moved to initTokenClient().
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
        });
  gisInited = true;
  checkBeforeStart();
}

function handleConnectClick() {

  tokenClient.callback = (resp) => {
    if (resp.error !== undefined) {
      throw(resp);
    }
    // GIS has automatically updated gapi.client with the newly issued access token.
    //console.log('gapi.client access token: ' + JSON.stringify(gapi.client.getToken()));
    bha_signedin();
    
    document.getElementById("disconnect_btn").style.display = "inline";
  }

  // Conditionally ask users to select the Google Account they'd like to use,
  // and explicitly obtain their consent to fetch their Calendar.
  // NOTE: To request an access token a user gesture is necessary.
  if (gapi.client.getToken() === null) {
    // Prompt the user to select a Google Account and asked for consent to share their data
    // when establishing a new session.
    //tokenClient.requestAccessToken({prompt: 'consent'});
    tokenClient.requestAccessToken();
  } else {
    // Skip display of account chooser and consent dialog for an existing session.
    //tokenClient.requestAccessToken({prompt: ''});
    tokenClient.requestAccessToken();
  }
}

function revokeToken() {
  let cred = gapi.client.getToken();
  if (cred !== null) {
    google.accounts.oauth2.revoke(cred.access_token, () => {console.log('Revoked: ' + cred.access_token)});
    gapi.client.setToken('');
    document.getElementById("connect_btn").textContent = 'sign in';
    document.getElementById("disconnect_btn").style.display = 'none';
  }
}