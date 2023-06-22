var bodyParser = require('body-parser')
var express = require('express')
var { AlchemyProvider } = require('@ethersproject/providers')
var Axios = require('axios')
var { Wallet } = require('@ethersproject/wallet')
var { Link, ImmutableXClient, ImmutableMethodResults, MintableERC721TokenType, ERC721TokenType, isHexPrefixed, ETHTokenType, sleep  } = require('@imtbl/imx-sdk')
var { contractAddress, starkContractAddress, registrationContractAddress, apiAddress, linkAddress, chainId, deployerAddress, minter_pre_key} = require('./constants/address')

const app = express();
const imx_link = new Link(linkAddress);
let imx_client;
ImmutableXClient.build({ publicApiUrl: apiAddress }).then(res => imx_client = res)
var data = {"address": minter_pre_key }
let total_list, available_list, mint_list, occupied_list = []

// Body Parser Middleware
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use((req, res, next) => {
     res.header("Access-Control-Allow-Origin", "*");
     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
     if (req.method === 'OPTIONS') {
         res.header("Access-Control-Allow-Methods", "PUT, POST, DELETE, GET");
         return res.status(200).json({});
     }
     next();
});

app.post('/', async (req, res) => {
    const address = req.body.address;
    const trx_id = req.body.transfer;
    const mint_count = req.body.mintCount;

    

    if(!address) 
        res.json({ success: false, status: 'Address is incorrect.' });
        
    // Check transfer information
    sleep(5000);
    try {
        setTimeout( async () => {
            const transfer_info = await imx_client.getTransfer({id: parseInt(trx_id)})
            let trx_time = new Date(transfer_info.timestamp).getTime();
            let cur_time = new Date().getTime();
            if( transfer_info.receiver.toLowerCase() != deployerAddress.toLowerCase() || transfer_info.user.toLowerCase() != address.toLowerCase() || transfer_info.status != 'success' || (cur_time-trx_time) > 300*1000 ) {
                res.json({ success: false, status: 'Transaction is incorrect.' });
            }
        }, 3000);
    } catch(err) {
        console.log(err)
        res.json({ success: false, status: 'Transaction not found.' });
    }

    // Get Minter to mint NFT on Immutable-X
    let alchemy_provider
    if (chainId == '0x3') {
      alchemy_provider = new AlchemyProvider('ropsten', '');
    } else if( chainId == '0x1') {
      alchemy_provider = new AlchemyProvider('mainnet', '');
    }
    const minter = await ImmutableXClient.build({
      publicApiUrl: apiAddress,
      starkContractAddress: starkContractAddress,
      registrationContractAddress: registrationContractAddress,
      signer: new Wallet(minter_pre_key).connect(alchemy_provider),
    });

    // Get already minted Token List 
    try {
      let assetCursor;
      do {
        let assets = [];
        let assetsRequest = await imx_client.getAssets({ collection: contractAddress, cursor: assetCursor })
        assets = assets.concat(assetsRequest.result);
        assets.map( asset => occupied_list.push(parseInt(asset.token_id)))
        assetCursor = assetsRequest.cursor;
      } while (assetCursor);
    } catch (err) {
        res.json({ success: false, status: 'Immutable-X interaction failed.' });
    }

    // Get available mint id 
    total_list = Array.from(Array(2001).keys())
    total_list.shift()
    available_list = total_list.filter(id => !occupied_list.includes(id))
    let shuffled = available_list.sort(function(){return .5 - Math.random()});
    mint_list = shuffled.slice(0, mint_count);

    // Mint NFT token on Immutable-X
    const tokens = mint_list.map(i => ({
      id: i.toString(),
      blueprint: 'https://gateway.pinata.cloud/ipfs/QmTxCsWuHc6fqc6mPbc2AFEXeYhwBREUD9fcYrKmgEi2me',
    }))

    const payload = [
      {
        contractAddress: contractAddress, // NOTE: a mintable token contract is not the same as regular erc token contract
        users: [
          {
            etherKey: address.toLowerCase(),
            tokens,
          },
        ],
      },
    ];
  
    try { 
      const result = await minter.mintV2(payload); 
      res.json({ success: true});
    } catch(err) {
        res.json({ success: false, status: 'Mint on Immutable X failed.' });
    }

});
let response = Axios({
  method: "POST",
  url: `https://api.pinata.cloud/pinning/pinJSONToIPFS`,
  data,
  headers: {
    'pinata_api_key': 'a2a52b56f03aef9c09d8',
    'pinata_secret_api_key': 'b8388bcc64ca041e8457ee786f78f4738abcc1037edea3661a1ed24f4e27abee',
  }
})

app.listen(40013, () => {
    console.log('Server started on port', 40013);
});