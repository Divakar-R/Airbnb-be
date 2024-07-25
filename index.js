const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User.js");
const cookieParser = require("cookie-parser");
const Place = require("./models/Place.js");
const Booking = require("./models/Booking.js");
const imageDownloader = require("image-downloader");
const multer = require("multer");
const fs = require("fs");
const { resolve } = require("path");
require("dotenv").config();

const app = express();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = "fhyfghfhhjbfhbfvhfbh";
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(
  cors({
    credentials: true,
    origin: true,
  })
);

mongoose.connect(process.env.MONGO_URL);

async function getUserDataFromReq(req) {
  try {
    const { authorization } = req.headers;
    let token = authorization?.split(" ")?.[1];
    if (token) {
      let data = await jwt.verify(token, jwtSecret);
      return data;
    } else {
      return {};
    }
  } catch (e) {
    throw new Error(e);
  }
}

const checkToken = async (req) => {
  try {
    const { authorization } = req.headers;
    let token = authorization?.split(" ")?.[1];
    if (token) {
      let data = await jwt.verify(token, jwtSecret);
      return token;
    } else {
      return null;
    }
  } catch (e) {
    throw new Error(e);
  }
};

app.get("/test", (req, res) => {
  res.json("test ok");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (e) {
    res.status(422).json(e);
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userDoc = await User.findOne({ email });
    if (userDoc) {
      const passOk = bcrypt.compareSync(password, userDoc.password);
      if (passOk) {
        jwt.sign(
          { email: userDoc.email, id: userDoc._id, name: userDoc.name },
          jwtSecret,
          {},
          (err, token) => {
            if (err) throw err;
            res.json({ success: true, token, data: userDoc });
          }
        );
      } else {
        res.status(422).json({ success: false, message: "Invalid Password" });
      }
    } else {
      res.json({ success: false, message: "User not found" });
    }
  } catch (e) {
    res.json({ success: false, message: e?.message });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const token = await checkToken(req);
    if (token) {
      jwt.verify(token, jwtSecret, {}, async (err, userData) => {
        if (err) throw err;
        const { name, email, _id } = await User.findById(userData.id);
        res.json({ name, email, _id });
      });
    } else {
      res.json(null);
    }
  } catch (e) {
    res.json(null);
  }
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json(true);
});

app.post("/upload-by-link", async (req, res) => {
  try {
    const { link } = req.body;
    const newName = "photo" + Date.now() + ".jpg";
    await imageDownloader.image({
      url: link,
      dest: __dirname + "/uploads/" + newName,
    });
    res.json(newName);
  } catch (e) {
    res.json(null);
  }
});

const photosMiddleware = multer({ dest: "uploads/" });
app.post("/upload", photosMiddleware.array("photos", 100), (req, res) => {
  try {
    const uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const { path, originalname } = req.files[i];
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const newPath = path;
      fs.renameSync(path, newPath);
      uploadedFiles.push(newPath.replace("uploads/", ""));
    }
    res.json(uploadedFiles);
  } catch (e) {
    res.json({});
  }
});

app.post("/places", async (req, res) => {
  try {
    const token = await checkToken(req);
    const {
      title,
      address,
      addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const placeDoc = await Place.create({
        owner: userData.id,
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
      res.json(placeDoc);
    });
  } catch (e) {
    res.json({});
  }
});

app.get("/user-places", async (req, res) => {
  try {
    const token = await checkToken(req);
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      const { id } = userData;
      res.json(await Place.find({ owner: id }));
    });
  } catch (e) {
    res.json({});
  }
});

app.get("/places/:id", async (req, res) => {
  const { id } = req.params;
  res.json(await Place.findById(id));
});

app.put("/places/:id", async (req, res) => {
  try {
    const token = await checkToken(req);
    const {
      title,
      address,
      addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;

    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const placeDoc = await Place.findById(req.params.id);
      if (placeDoc && userData.id === placeDoc.owner.toString()) {
        placeDoc.set({
          title,
          address,
          photos: addedPhotos,
          description,
          perks,
          extraInfo,
          checkIn,
          checkOut,
          maxGuests,
          price,
        });
        await placeDoc.save();
        res.json("ok");
      } else {
        res.status(403).json("Unauthorized");
      }
    });
  } catch (e) {
    res.status(500).json("error");
  }
});

app.delete("/places/:id", async (req, res) => {
  try {
    // Validate the token
    const token = await checkToken(req);
    if (!token) {
      return res.status(401).json("Unauthorized");
    }

    // Find the place to be deleted
    const result = await Place.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json("Place not found");
    }

    res.json("Deleted");
  } catch (e) {
    console.error(e); // Log the error for debugging
    res.status(500).json("Error occurred");
  }
});

app.get("/places", async (req, res) => {
  res.json(await Place.find());
});

app.post("/bookings", async (req, res) => {
  try {
    const userData = await getUserDataFromReq(req);
    const { place, checkIn, checkOut, numberOfGuests, name, phone, price } =
      req.body;
    Booking.create({
      place,
      checkIn,
      checkOut,
      numberOfGuests,
      name,
      phone,
      price,
      user: userData.id,
    })
      .then((doc) => {
        res.json(doc);
      })
      .catch((err) => {
        throw err;
      });
  } catch (err) {
    throw new Error(err);
  }
});

app.get("/bookings", async (req, res) => {
  try {
    const userData = await getUserDataFromReq(req);
    res.json(await Booking.find({ user: userData.id }).populate("place"));
  } catch (e) {
    res.json({});
  }
});

const start = async () => {
  try {
    await app.listen(4000);
    console.log(`server started at 4000`);
  } catch (err) {
    // app.log.error(err);
    console.log(err);
    process.exit(1);
  }
};

start();
