import mongoose from "mongoose";

const connect = async (req, res) => {
  try {
    const connect = await mongoose.connect(process.env.MONGO_URI);

    console.log(`Connecting to ${connect.connection.host}`);
  } catch (err) {
    console.log(`Error ${err.message}`);

    process.exit(1);
  }
};

export default connect;
