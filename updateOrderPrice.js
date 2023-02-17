/*
Dependencies
> nodejs
> sync-fetch
> utf8
*/

setInterval(() => {

    //define location
    const location = { file: `updateOrderPrice`, };

    //define unprocessed cards hash map
    const unprocessedCardIDs = {};

    //define the input marketName
    let input_marketName = ``;
    //define the input id
    let input_id = ``;

    //get all cards prices that haven't been updated in the last week with a status of 1
    Object.values(queryLocalDatabase(
        `
        SELECT marketName, id 
        FROM steamTradingCards 
        WHERE statusDate < NOW() - INTERVAL 1 WEEK 
        AND status = 1
        `,
        location,
    )).forEach(({ marketName, id }) => unprocessedCardIDs[marketName] = id);

    //get all of the NEW_BUY_ORDER entries
    const entries = Object.values(queryLocalDatabase(
        `
        SELECT response 
        FROM dataLog 
        WHERE action = 'NEW_BUY_ORDER' 
        `,
        location,
    ));

    //loop through each NEW_BUY_ORDER entry
    entriesLoop: for(let i = 0; i < entries.length; i++) {

        //parse the entry's response to get the set of cards
        const SET = JSON.parse(entries[i]);

        //loop through each card in the set
        for(let j = 0; j < SET.length; j++) {

            //get the marketName of the iterated card
            const { marketName } = SET[j];

            //get the id of the unproccessed marketName
            const id = unprocessedCardIDs[marketName];

            //if card has been processed, continue
            if(!id) continue;

            //set the input marketName to the marketName
            input_marketName = marketName; 
            //set the input id to the id
            input_id = id;

            //break out of the entriesLoop
            break entriesLoop;

        }

    }

    //if the input marketName or id hasn't been set, return
    if(!input_marketName || !input_id) return;

    //log the input marketName
    console.log(input_marketName);

    //set the orderPrice of the input card and get its returned status
    const status = setOrderPrice(input_marketName, input_id);

    //set the status of the input card
    queryLocalDatabase(
        `
        UPDATE steamTradingCards 
        SET status = ${status} 
        WHERE id = ${input_id === false ? 1 : input_id}
        `,
        location,
    );

}, 1000 * 60 * 2);

function setOrderPrice (marketName, id) {

    //define location
    const location = {file: 'setPrices.js', function: 'setOrderPrice'};

    //get the current date
    const date = getDate();

    //define status types 
    const STATUS = {
        ERR_NO_LISTINGS: 0,
        SUCCESS: 1,
        ERR_STEAM_QUERY: 2,
        LOCKED: 3,
    }

    //lock the card
    queryLocalDatabase(
        `
        UPDATE steamTradingCards 
        SET status = ${STATUS.LOCKED} 
        WHERE id = ${id}
        `,
        location,
    );

    //get the sell order data given the marketName
    const sellOrderData = handleQuery(
        `https://steamcommunity.com/market/priceoverview/?appid=753&currency=28&market_hash_name=${escapeCharacters(marketName)}`,
        location,
    );
    //error handling
    if(!sellOrderData?.success) return STATUS.ERR_STEAM_QUERY;

    //select the median price with a fallback of the lowest sell order price
    let priceString = sellOrderData?.median_price ?? sellOrderData.lowest_price;
    //error handling
    if(!priceString) return STATUS.ERR_NO_LISTINGS;

    //process the price string for the lowest sell order in rounded rand cents
    let orderPrice = Math.round(parseFloat(priceString?.split(' ')[1]) * 100);

    //error handling
    if(isNaN(orderPrice)) return false;

    //update the orderPrice of the steamTradingCards entry at the given marketName
    if(!queryLocalDatabase(
        `
        UPDATE steamTradingCards 
        SET orderPrice = ${orderPrice}, statusDate = ${date}
        WHERE id = ${id}
        `,
        location,
    )) return false;

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
		if (string[u] == '/' || string[u] == '\\') {
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
