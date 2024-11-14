require("dotenv").config();
const { MongoClient } = require("mongodb");
const fs = require('fs'); 
const path = require('path');

// Set MongoDB client
const client = new MongoClient(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Function to connect to your mongodb
const connectToMongoDB = async () => {
  try {
    await client.connect();
    return client;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

// Function to get a content by course name
const getContentsByCourse = (courseName) =>
  connectToMongoDB()
    .then(async (client) => {
      const db = client.db("DLX");
      const contentsCollection = db.collection("contents");
      const coursesCollection = db.collection("courses");

      return coursesCollection.findOne({ name: courseName }).then((course) =>
        contentsCollection
          .find({ title: { $in: course.dlx } })
          .toArray()
          .then((contents) => {
            // Insert a url for routing to each dlx
            for (let i = 0; i < contents.length; i++) {
              contents[i].url = `${process.env.URL}/dlx/${contents[i].param}`;
            }
            return contents;
          })
      );
    })
    .catch((err) => {
      console.error(err);
    });

const getContentByParam = (param) =>
  connectToMongoDB()
    .then(async (client) => {
      const db = client.db("DLX");
      const contentsCollection = db.collection("contents");

      return contentsCollection
        .findOne({ param: param })
        .then((content) => content);
    })
    .catch((err) => {
      console.error(err);
    });

/*
* Function     : getFolderNames()
* Parameter    : directory - Path of the directory from which you want to read folder names
* Return Value : array of string (names of folder)
* Description  : This function reads and returns the folder names in the directory path accepted as a parameter
*/
const getFolderNames = (directory) => {
  return fs.readdirSync(directory).filter(file => {
    return fs.statSync(path.join(directory, file)).isDirectory();
  });
};

/*
* Function     : updateMongoDB()
* Parameter    : course - this should be the acutal name of the course from LMS
* Return Value : void
* Description  : This function has following logics
*                 1. Read the folder's names in the 'projectDirectory'
*                 2. Update the 'contents' table based on the folder's names
*                   >> Add & Delete new or obsolete  table, document, and field in the 'contents' table
*                 3. Update the 'coruses' table based on the 'title' fields in the 'contents' table
*                   >> Add new table, document, and field in the 'contents' table
*                   >> Delete obsolete field only in the 'contents' table 
*/
const updateMongoDB = async (course) => {
  // project directory path
  const projectDirectory = path.join('/var/www/html'); // path.join(process.cwd(), 'public');
  try {
    const client = await connectToMongoDB();
    const db = client.db('DLX');
    const contentsCollection = db.collection('contents');
    const coursesCollection = db.collection('courses');

    // Read all folders's name 
    const projectTitle = getFolderNames(projectDirectory);
    console.log('Discovered Project List:', projectTitle);

    // Create 'contents' collection(table) schema
    const folderData = projectTitle.map(projectTitle => ({
      type: "ltiResourceLink",
      title: projectTitle.replace(/-/g, ' '), // replace hyphen to space. It will be used to 'content list'
      param: projectTitle
    }));

    // Retrieve existing data queries from MongoDB
    const [contents, courses] = await Promise.all([
      contentsCollection.find({}).toArray(),
      coursesCollection.find({}).toArray()
    ]);

    // Step 01: If there is no data in the database, insert all folder names to MongoDB
    if (contents.length === 0) {
      await contentsCollection.insertMany(folderData);
      console.log('the contents table is created');
    } else {
      // Step 02: Check whether the content table has been updated and update to the latest version
      const existingParams = contents.map(content => content.param);
      const newProjects = folderData.filter(folder => !existingParams.includes(folder.param));

      if (newProjects.length > 0) {
        await contentsCollection.insertMany(newProjects);
        console.log('New Project Name:', newProjects);
      } else {
        console.log('Database is up-to-date');
      }

      // Step 03: Delete data not in the folder list
      const obsoleteProjects = contents.filter(content => !projectTitle.includes(content.param));
      if (obsoleteProjects.length > 0) {
        const obsoleteParams = obsoleteProjects.map(folder => folder.param);
        await contentsCollection.deleteMany({ param: { $in: obsoleteParams } });
        console.log('Obsolete Projects are deleted:', obsoleteProjects);
      }
    }

    // Step 04: Check whether the given 'course' name exist or not in the DB
    const courseDoc = await coursesCollection.findOne({ name: course });
    if (!courseDoc) {
      // If the 'course' doesn't eixst, create new table
      const newCourse = {
        name: course,
        dlx: contents.map(content => content.title) 
      };
      await coursesCollection.insertOne(newCourse);
      console.log('The courses table is created with the new course:', newCourse);
    } else {
      const existingDlx = courseDoc.dlx;
      const updatedDlx = contents.map(content => content.title);

      // Step 05: If there are any missing data, add the project name to the dlx list
      const newDlxItems = updatedDlx.filter(title => !existingDlx.includes(title));
      if (newDlxItems.length > 0) {
        await coursesCollection.updateOne(
          { name: course },
          { $addToSet: { dlx: { $each: newDlxItems } } }
        );
        console.log('Added new dlx items for course:', newDlxItems);
      }

      // Step 06: If there is data removed, delete the project name from the dlx list
      const obsoleteDlxItems = existingDlx.filter(title => !updatedDlx.includes(title));
      if (obsoleteDlxItems.length > 0) {
        await coursesCollection.updateOne(
          { name: course },
          { $pull: { dlx: { $in: obsoleteDlxItems } } }
        );
        console.log('Removed obsolete dlx items for course:', obsoleteDlxItems);
      }

      if (newDlxItems.length === 0 && obsoleteDlxItems.length === 0) {
        console.log('The dlx list for course is up-to-date:', course);
      }
    }

    await client.close();
  } catch (error) {
    console.error('Error occurred while updating MongoDB:', error);
  }
};

module.exports = {
  getContentsByCourse,
  getContentByParam,
  getFolderNames,
  updateMongoDB,
};
