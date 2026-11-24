//! A withdrawal proof for the third of three notes, with its verification key,
//! hex-encoded in the contract's wire format. Run `npm run build:fixture`.

pub const RECIPIENT: &str = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA";
pub const RELAYER: &str = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

pub const A: &str = concat!(
    "26df853df2cd21686af485f2cc5fb67a127e2cfa055cefd632a620c49dc91beb",
    "1bb96e425db5f2c740f054e1508022f7a92ed92430dbca52d26ab83079215900",
);

pub const B: &str = concat!(
    "13669a06eea90cfd39bdbdd8948a853fd52dc4f6b0b74b6bafbd0c63fe4bc641",
    "04e9cb8bb8b436f72eac4956fabf2c508c2c1c8155f984d75a217d34e78070dd",
    "1373bb3ed03b6953ee151cd148e2b5ba16a9ffd527722437ba9d3f4a1f6d2216",
    "27f22d16ed93423983b98979cd6605622a127621ade56f156b1a3adeb2ff5b41",
);

pub const C: &str = concat!(
    "01b5c033736eb8ad07f5b05019010f121f227f9c855cf3ddc57c56a15f858b58",
    "225afff17dd96b66ac2d341ccb72ed527f591dd3e5be88630fc1619b2c7799c0",
);

pub const ALPHA: &str = concat!(
    "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e2",
    "14bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926",
);

pub const BETA: &str = concat!(
    "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c",
    "0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab",
    "304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a7",
    "1739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8",
);

pub const GAMMA: &str = concat!(
    "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
    "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
    "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
    "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
);

pub const DELTA: &str = concat!(
    "003f08333e38b3e2f873dc1aa075bbfca6b49938db54db8c3441206930fcbc78",
    "0bfe69b5324baf978c981e7a34e7cc935d9ac0e8306a384fed266fd6f75f0812",
    "10ebe279fbaecf467d5f36be66fb7bdb4f31e2ecce489d3a99ee622d7f74299b",
    "18863ba8ed4adce67fed2185452168dfd266d2d69d494d8734ed5ac3ec4fff3a",
);

pub const IC0: &str = concat!(
    "2b533465b36292ef0ac3c4045de437617100d97988de082d8befc4295b36f747",
    "11b308ac78bb6c5603b67e3e8883a72f5925501b2301526d20eac19ef33ee5a6",
);

pub const IC1: &str = concat!(
    "0dbc6a7c90340f320296dc3d6607c88a8ac6f1bd0d31c1e8671b524e95ba802d",
    "2eb8898ff7bb4997a408b50301f41215c2b391334c4344d7e49042b305b01064",
);

pub const IC2: &str = concat!(
    "0d9177e9ad03212e0e2294d8ca397ead5c28410b8f00fa84763b89029f273b36",
    "15ec57ad5be46a67fb2e9ce89d8c1e6c43802bb6ef3e186b6d35dbc455f41af0",
);

pub const IC3: &str = concat!(
    "166f8b4d527497390786819ece86423367b32cdb2483133b0dfb938db8155efa",
    "2ec77b407e5833e3592bb9cc9dfb3190a1d0885f64afd473a6e0555015687343",
);

pub const LEAF0: &str = concat!(
    "1bd3bc085cb0e21acaae0d44a4731dcb004b3114a8c1bf3e912182470970b092",
);

pub const LEAF1: &str = concat!(
    "270abec11b39756fe294f086b8e039bc283d2fcbfab7433929ab01328f6fd8d7",
);

pub const LEAF2: &str = concat!(
    "21f62e5c60f4be98432f84da7f4ee8f971aa9dee18602c320854c8a7baa6f439",
);

pub const NULLIFIER: &str = concat!(
    "06ce0eb069950e5f1f46ad7ed952d97549f4a21ca7d86adc617696bd7e8c270c",
);

pub const ROOT: &str = concat!(
    "2011ba39be475de6242fc719ef6268be98d5831ee331220e239907508a2f4adf",
);
