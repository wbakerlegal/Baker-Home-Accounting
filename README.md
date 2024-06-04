# Baker-Home-Accounting

Front-end for Google sheets runs client-side in plain Javascript.
Uses browser localStorage to save state between sessions.

All functionality in bha-scripts.js. 
There is some interdependence, but generally the format followed within bha-scripts.js for each area of the website is as follows:
create objects from spreadsheet data
modular dom generation
initialize/populate
create objects of dom elements
user interface/view handlers
user command handlers, validation
user command handlers updating spreadsheet
event dispatchers
