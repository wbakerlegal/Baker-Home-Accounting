# Baker-Home-Accounting

Front-end for Google sheets runs client-side in plain Javascript.
Uses browser localStorage to save state between sessions.

All functionality in bha-scripts.js. 
There is some interdependence, but generally the format followed within bha-scripts.js for each area of the website is as follows:
1. Create objects from spreadsheet data. 2. Modular dom generation. 3. Initialize/populate. 4. Create objects of dom elements. 5. User interface/view handlers. 6. User command handlers, validation. 7. User command handlers updating spreadsheet. 8. event dispatchers
