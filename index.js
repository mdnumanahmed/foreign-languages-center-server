const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  //bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// const uri = "mongodb://localhost:27017"

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@flc.panjdap.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const userCollection = client.db("flc_db").collection("users");
    const classCollection = client.db("flc_db").collection("classes");
    const savedCollection = client.db("flc_db").collection("savedClasses");
    const paymentCollection = client.db("flc_db").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Save user data to db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const registeredUser = await userCollection.findOne(query);
      if (registeredUser) {
        return res.send({ message: "User already registered" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // verify admin by email
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // verify instructor by email
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    // verify student by email
    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === "student" };
      //  console.log(result);
      res.send(result);
    });

    // make admin api
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // make instructor api
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get all instructor
    app.get("/instructor", async (req, res) => {
      const query = { role: "instructor" };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Class api
    app.patch(
      "/class/approve/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "approve",
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.patch("/class/deny/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "deny",
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/class/:email", async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/class", verifyJWT, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/approvedClass", async (req, res) => {
      const query = { status: "approve" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/class", verifyJWT, verifyInstructor, async (req, res) => {
      const newItem = req.body;
      const result = await classCollection.insertOne(newItem);
      res.send(result);
    });

    // Selected Class api for students
    app.get("/savedClass", async (req, res) => {
      const { id } = req.query;
      const query = { _id: new ObjectId(id) };
      const result = await savedCollection.findOne(query);
      res.send(result);
    });

    app.get("/savedClass/:email", async (req, res) => {
      const email = req.params.email;
      const query = { studentEmail: email };
      const result = await savedCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/savedClass", async (req, res) => {
      const saved = req.body;
      const email = saved.studentEmail;
      const name = saved.name;
      const query = {
        $and: [{ name: { $eq: name } }, { studentEmail: { $eq: email } }],
      };
      const existingClass = await savedCollection.findOne(query);

      if (existingClass) {
        return res.send({ message: "Class  already exists" });
      }
      const result = await savedCollection.insertOne(saved);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //Payment related API
    app.post("/payments/:id", verifyJWT, async (req, res) => {
      const payment = req.body;
      payment.createAt = new Date();
      const insertResult = await paymentCollection.insertOne(payment);
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const deleteResult = await savedCollection.deleteMany(query);
      res.send({ insertResult, deleteResult });
    });

    app.put("/payment/:name", async (req, res) => {
      const name = req.params.name;
      const filter = { name: name };
      const options = { upsert: true };
      const updateDoc = {
        $inc: {
          booking: 1,
        },
      };
      const result = await classCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.get("/payment/:email", async (req, res) => {
      const email = req.params.email;
      const query = { studentEmail: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    //sort with descending
    app.get("/history/:email", async (req, res) => {
      const email = req.params.email;
      const query = { studentEmail: email };
      const result = await paymentCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("FLC is running");
});

app.listen(port, () => {
  console.log(`FLC server is running on port: ${port}`);
});
