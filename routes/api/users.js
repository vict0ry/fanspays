const express = require('express');
const app = express();
const router = express.Router();
const bodyParser = require("body-parser")
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const upload = multer({dest: "uploads/"});
const User = require('../../schemas/UserSchema');
const jwt = require("jsonwebtoken");
const Credit = require("../../schemas/CreditSchema");
const {SubscriptionHelper} = require("../../SubscriptionHelper");
const {CreditHelper} = require("../../CreditHelper");
const Notification = require("../../schemas/NotificationSchema");
const bcrypt = require("bcrypt");

app.use(bodyParser.urlencoded({extended: false}));

router.get("/", async (req, res, next) => {
    let searchObj = req.query;
    let perPage = 12
        , page = req.query.page > 0 ? req.query.page : 0;
    const count = await User.count();



    if (req.query.search !== undefined) {
        searchObj = {
            $or: [
                {firstName: {$regex: req.query.search, $options: "i"}},
                {lastName: {$regex: req.query.search, $options: "i"}},
                {username: {$regex: req.query.search, $options: "i"}},
            ]
        }
    } else {
       return User.find()
            .limit(perPage)
            .skip(perPage * page)
            .sort({username: 'asc'})
            .then(async (data) => {
                return res.status(200).send({
                    data,
                    page,
                    pages: Math.floor(count / perPage)
                })
            })
            .catch(error => {
                console.log(error);
                res.sendStatus(400);
            })
    }

    User.find(searchObj)
        .limit(perPage)
        .skip(perPage * page)
        .sort({username: 'asc'})
        .then(async (data) => {
            return res.status(200).send({
                data,
                page,
                pages: Math.floor(count / perPage)
            })
        })
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })
});

router.put("/:userId/follow", async (req, res, next) => {

    const userData = jwt.decode(req.headers.authorization, 'secretkey')
    const {_id} = userData;

    const userId = req.params.userId;

    const user = await User.findById(userId);

    if (user == null) return res.sendStatus(404);
    const isFollowing = user.followers && user.followers.includes(_id);
    const subscriptionInit = await new SubscriptionHelper(userData._id, userId).create();
    if (subscriptionInit.isActive) {
        return res.status(200).send('You already subscribed');
    } else {
        // check if user have enough of money
        const recipient = await User.findOne({'_id': req.body.recipient});
        const creditInstance = await new CreditHelper(userData, recipient);
        if(await creditInstance.insufficientBalance(req.body.amount)) {
            return res.status(200).send({
                error: {
                    message: 'INSUFFICIENT_BALANCE'
                }
            });
        }
        await new CreditHelper(userData, user, res).subscribe();
        await Notification.insertNotification(userId, _id, "FOLLOW");
    }


    const option = isFollowing ? "$pull" : "$addToSet";

    const updatedUser = await User.findByIdAndUpdate(_id, {[option]: {following: userId}}, {new: true})
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })

    User.findByIdAndUpdate(userId, {[option]: {followers: _id}})
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })

    // if (!isFollowing) {
    //     await Notification.insertNotification(userId, _id, "follow", _id);
    // }

    res.status(200).send(updatedUser);
})

router.get("/:userId/following", async (req, res, next) => {
    User.findById(req.params.userId)
        .populate("following")
        .then(results => {
            res.status(200).send(results);
        })
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })
});

router.get("/:userId/followers", async (req, res, next) => {
    User.findById(req.params.userId)
        .populate("followers")
        .populate("following")
        .then(results => {
            const {following, followers} = results
            res.status(200).send({following, followers});
        })
        .catch(error => {
            console.log(error);
            res.sendStatus(400);
        })
});
router.put("/updateprofile", async (req, res, next) => {
    console.log(req.body.email, req.body.checkboxes);

    const user = await jwt.decode(req.headers.authorization, 'secretkey');
    const foundUser = await User.findByIdAndUpdate(user._id, {
        description: req.body.description,
        username: req.body.username,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        birthDate: req.body.birthDate
    }, {new: true});
    res.status(200).send(foundUser)
});

// router.put("/updateParameters", async(req, res) => {
//     const userJwt = await jwt.decode(req.headers.authorization, 'secretkey');
//     const user = await User.findOne({_id: userJwt._id});
//
// });
router.put('/updateEmail', async (req,res,next) => {
    const userJwt = await jwt.decode(req.headers.authorization, 'secretkey');
    const findUser = await User.findOneAndUpdate({_id: userJwt._id}, {email: req.body.email});
    return res.send(findUser);
})
router.put("/updatePassword", async (req, res) => {
    const userJwt = await jwt.decode(req.headers.authorization, 'secretkey');
    const findUser = User.findOne({_id: userJwt._id});
    const user = await findUser;

    const pass = await findUser.select('password');

    const result = await bcrypt.compare(req.body.oldPassword, pass.password);

    if(result){
        const newPassHash = await bcrypt.hash(req.body.newPassword, 10);
        user.password = newPassHash;
        await user.save();

        res.status(200).send("password changed successful");
    } else {
        res.status(400).send("old password does not match");
    }
});

router.put('/subscribtionPrice', async (req,res,next) => {
    const user = await jwt.decode(req.headers.authorization, 'secretkey');
    const foundUser = await User.findByIdAndUpdate(user._id, {
        subscribtionPrice: req.body.price
    }).then(i => {
        return res.send(200);
    })
});

router.get('/search/:username', async (req,res,next) => {
    const users = await User.find({ username: {$regex: req.params.username.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')} });
    console.log(users.map(i => i.username));
    return res.status(200).send(users.map(i => i.username));
})

router.post("/profilePicture", upload.single("croppedImage"), async (req, res, next) => {
    const user = await jwt.decode(req.headers.authorization, 'secretkey');
    if (!req.file) {
        console.log("No file uploaded with ajax request.");
        return res.sendStatus(400);
    }
    const filePath = `/uploads/images/${req.file.filename}.png`;
    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, `../../${filePath}`);
    await fs.rename(tempPath, targetPath, async error => {
        if (error != null) {
            console.log(error);
            return res.sendStatus(400);
        } else {
            const foundUser = await User.findByIdAndUpdate(user._id, {
                profilePic: filePath
            });
            res.status(200).send(foundUser);
        }
    })

});

module.exports = router;
