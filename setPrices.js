setInterval(() => {

    console.log();

    console.log(queryLocalDatabase(
        `
        SELECT COUNT(*) as count 
        FROM steamTradingCards 
        WHERE NOT orderPrice = 0
        `,
        {file: 'setPrices'},
    )?.[0]?.count);

    let res = defineOrderPrice();

    console.log(res);

    if(res === 0) process.exit(0);

}, 120000);

function defineOrderPrice () {

    //define location
    const location = {file: 'setPrices.js', function: 'defineOrderPrice'};

    //define response types
    const RES = {
        FINISHED: 0,
        SUCCESS: 1,
    }

    //select an unpriced steamTradingCards entry 
    const entry = queryLocalDatabase(
        `
        SELECT marketName, id 
        FROM steamTradingCards 
        WHERE orderPrice = 0 
        AND status = 1 
        ORDER BY steamGamesID ASC 
        LIMIT 1
        `,
        location,
    );
    //if the query fails, return the select error response
    if(!entry) return errorLog(`CRITICAL:Failed Order Price Select Query`, JSON.stringify(location));

    //if there are no results, return finished response
    if(entry?.result) return RES.FINISHED;

    //get the marketName from the entry
    let { marketName, id } = entry[0];
    console.log(marketName);

    //set the order price and get the returned status
    let status = setOrderPrice(marketName, id);

    //if the status is a success, return the success response
    if(status === RES.SUCCESS) return RES.SUCCESS;

    //if the status is an error, change the status of the entry to the status returned from setOrderPrice
    let res = queryLocalDatabase(
        `
        UPDATE steamTradingCards 
        SET status = ${status} 
        WHERE id = ${id}
        `,
        location,
    );
    //if the update fails, return the status update response
    if(!res) return errorLog(`CRITICAL:Failed Order Price Status Update`, JSON.stringify(location));

    //return the status
    return status;

}

function setOrderPrice (marketName, id) {

    //define location
    const location = {file: 'setPrices.js', function: 'setOrderPrice'};

    //define status types 
    const STATUS = {
        SUCCESS: 1,
        ERR_STEAM_QUERY: 2,
        ERR_NO_LISTINGS: 3,
        ERR_ORDERPRICE: 4,
        ERR_UPDATE: 5,
    }

    //get the sell order data given the marketName
    const sellOrderData = handleQuery(
        `https://steamcommunity.com/market/priceoverview/?appid=753&currency=28&market_hash_name=${escapeCharacters(marketName)}`,
        location,
    );
    //error handling
    if(!sellOrderData?.success) return STATUS.ERR_STEAM_QUERY;

    //select the median price with a fallback of the lowest sell order price
    let priceString = sellOrderData?.median_price ?? sellOrderData.lowest_price;
    console.log(priceString);
    //error handling
    if(!priceString) return STATUS.ERR_NO_LISTINGS;

    //process the price string for the lowest sell order in rounded rand cents
    let orderPrice = Math.round(parseFloat(priceString?.split(' ')[1]) * 100);

    //error handling
    if(isNaN(orderPrice)) return STATUS.ERR_ORDERPRICE;

    //update the orderPrice of the steamTradingCards entry at the given marketName
    if(!queryLocalDatabase(
        `
        UPDATE steamTradingCards 
        SET orderPrice = ${orderPrice} 
        WHERE id = ${id}
        `,
        location,
    )) return STATUS.ERR_UPDATE;

    //return true, marking a success
    return STATUS.SUCCESS;

}

function queryLocalDatabase (sql, queryData) {

	//define localtion
	const location = {file: 'setPrices.js', function: 'queryLocalDatabase'};

	//input error handling
	if(!sql || !queryData) return errorLog(`Invalid queryLocalDatabase Inputs`, JSON.stringify({sql, queryData, ...location}));

	//replace invalid characters
	sql = sql.replace(/'/g, "%27").replace(/ /g, '+').replace(/,/g, '%2C').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/#/g, '%23').replace(/&/g, '%26');

	//intialize the local database query
	let query = `https://snipecs.com/api-ext/token.php?token=ThisShouldBeARareTokenButIGuessThatItIsnt&query=${sql}`;
	
	//synchronously query our local database
	return handleQuery(query, queryData);

}

function handleQuery (query, queryData) {

	//define libraries
	const fetch = require('sync-fetch');

	//determine query type
	const queryType = queryData?.function ?? queryData?.file;

	try {

		//synchronously query for data in a json format
		const result = fetch(query).json();

		//if the result is error free, return the result
		if(!result.error) return result;

		//if there is an error and the queryType is errorLog, prevent errorLog recursion
		if(queryType === 'errorLog') return false;

		//otherwise, log the error
		return errorLog(`${queryType} Query Error`, JSON.stringify({type: result.error, ...queryData}));

	} catch(err) {

		//if the query throws and error and the queryType is errorLog, prevent errorLog recursion
		if(queryType === 'errorLog') return false;

		//otherwise, log the error
		return errorLog(`${queryType} Query Error`, JSON.stringify({type: err.type, ...queryData}));

	}
}

function errorLog (errorType, errorData) {

	//define location
	const location = {function: 'errorLog', file: 'setPrices.js'};

	//get the current date
	const date = getDate();

	//intialize insert sql
	let sql = `INSERT INTO errorLogs (date, name, data) VALUES (%27${date}%27, %27${errorType}%27, %27${errorData}%27)`;
	//log the error to our local database
	queryLocalDatabase(sql, location);

	//return false
	return false;

}

function escapeCharacters(string){
	const location = {file: "data.js", function: "escapeCharacters"};
	if(typeof string !== "string") return errorLog("Invalid escapeCharacters Input", JSON.stringify(location));
	const utf8 = require("utf8");
	for(var u = 0; u < string.length; u++){
		if("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~[]@$()*,;=%' ".includes(string[u])) continue;
		var char = utf8.encode(string[u]);
		var newHex = '';
		if(string[u] == '`') {
			newHex = '\'';
		} else if (string[u] == '/' || string[u] == '\\') {
			newHex = '-';
		} else {
			for(var p = 0; p < char.length; p++) {
				var hex = char.charCodeAt(p).toString(16);
				for(var q = 0; q < hex.length; q++) {
					if("abcdefghijklmnopqrstuvwxyz".includes(hex[q])) hex = hex.toUpperCase();
				}
				newHex = newHex + '%' + hex;
			}
		}
		string = string.replace(string[u], newHex);
		u = u + (newHex.length-1);
	}
	return string;
}

function getDate(date_ob = new Date()){
	let day = ("0" + date_ob.getDate()).slice(-2);
	let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
	let year = date_ob.getFullYear();
	let hours = date_ob.getHours();
	hours = ("0" + hours).slice(-2);
	let minutes = date_ob.getMinutes();
	minutes = ("0" + minutes).slice(-2);
	let seconds = date_ob.getSeconds();
	seconds = ("0" + seconds).slice(-2);
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
