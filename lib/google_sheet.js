const fs = require('fs');
const assert = require('assert');
const {google} = require('googleapis');
const Emitter = require('events');
const NOT_CALLED = 'not called';
const DIALING = 'dialing';
const IN_PROGRESS = 'call in progress';
const CALL_ENDED = 'call complete';
const CALL_FAILED_BUSY = 'call failed - busy';
const CALL_FAILED_NO_ANSWER = 'call failed - no answer';
const CALL_FAILED = 'call failed';

class Spreadsheet extends Emitter {
  constructor(logger) {
    super();
    this.logger = logger;

    this._init();
  }

  get authenticated() {
    return !!this.auth;
  }

  _init() {
    fs.readFile(process.env.OAUTH_CREDENTIALS, (err, content) => {
      if (err) return this.logger.error({err}, 'Error loading oauth client secret file');
      // Authorize a client with credentials, then call the Google Sheets API.
      this._authorize(JSON.parse(content));
    });
  }

  _authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(process.env.OAUTH_TOKEN, (err, token) => {
      if (err) return this.logger.error({err}, 'You need to manually run oauth2 to generate a token');
      oAuth2Client.setCredentials(JSON.parse(token));
      this.auth = oAuth2Client;
      this.logger.info({oAuth2Client}, 'successfully authenticated');
      this.emit('authenticated');
    });
  }

  async isCallingEnabled() {
    if (!this.auth) return false;
    return new Promise((resolve, reject) => {
      const sheets = google.sheets({version: 'v4', auth: this.auth});
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'setup!B4:B4',
      }, (err, res) => {
        if (err) return reject(err);
        const status = res.data.values[0].toString().trim().toUpperCase();
        this.logger.info(`value of calling enabled: ${status}`);
        resolve(status === 'TRUE');
      });
    });

  }

  async readSheet() {
    assert.ok(this.auth, 'Cannot read google sheet since oauth has failed or not yet completed');

    return new Promise((resolve, reject) => {
      const sheets = google.sheets({version: 'v4', auth: this.auth});
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'phone numbers!A2:C',
      }, (err, res) => {
        if (err) return reject(err);
        this.customers = res.data.values.map((row, idx) => {
          return {
            telNumber: row[0],
            name: row[1],
            status: row[2],
            statusCell: `C${idx + 2}`
          };
        });
        resolve(this.customers);
      });
    });
  }

  async updateStatus(customer, value) {
    const cell = `phone numbers!${customer.statusCell}`;
    this.logger.info(`updating cell ${cell} with ${value}`);
    const sheets = google.sheets({version: 'v4', auth: this.auth});
    const request = {
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: cell,
      valueInputOption: 'RAW',
      resource: {
        range: cell,
        majorDimension: 'ROWS',
        values: [[value]]
      }
    };
    return (await sheets.spreadsheets.values.update(request)).data;
  }


}

module.exports = Spreadsheet;
