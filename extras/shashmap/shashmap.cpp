/*
 *
 * This is the main class for the Saito Hashmap interface with Node
 * 
 * The Google Dense Map is contained in the file hashmap.cpp while
 * this file handles the interface with NodeJS and the processing 
 * of the JSON block file.
 *
 */

#include <google/dense_hash_map>
#include <node.h>
#include <iostream>
#include <sstream>
#include <fstream>
#include <stdio.h>
#include <string.h>


#include <algorithm>

using google::dense_hash_map;
using namespace std;


///////////////
// variables //
///////////////
google::dense_hash_map<std::string, int> slips;




struct StringToIntSerializer {

    bool operator()(std::ofstream* stream, const std::pair<const std::string, int>& value) const {
        size_t sizeSecond = sizeof(value.second);
        size_t sizeFirst = value.first.size();
        stream->write((char*)&sizeFirst, sizeof(sizeFirst));
        stream->write(value.first.c_str(), sizeFirst);
        stream->write((char*)&value.second, sizeSecond);
        return true;
    }

    bool operator()(std::ifstream* istream, std::pair<const std::string, int>* value) const {
        // Read key
        size_t size = 0;
        istream->read((char*)&size, sizeof(size));
        char * first = new char[size];
        istream->read(first, size);
        new (const_cast<string *>(&value->first)) string(first, size);  // <-- Error

        // Read value
        int second = 0;
        istream->read((char*)&second, sizeof(second));
        new (&value->second) int(second);
        return true;
    }
};





///////////////////////////
// function declarations //
///////////////////////////
std::string open_file(std::string filename);
std::string return_slipname(std::string bid, std::string tid, std::string sid, std::string address, std::string amount, std::string bhash);
int insert_new_slip(std::string slipname, int spent_value_of_zero);
int validate_mempool_slip(std::string slipname);
int validate_existing_slip(std::string slipname, int value);
int validate_slip_spent(std::string slipname, int current_block_id); // is spent (not is spendable in this block) -- for monetary check
int update_existing_slip(std::string slipname, int value);
int check_slip_exists(std::string slipname);
int slip_value(std::string slipname);
int delete_slip(std::string slipname);
int save();
int load();


using v8::Exception;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Null;
using v8::Object;
using v8::String;
using v8::Value;



void jsSaveHashmap(const FunctionCallbackInfo<Value>& args) {

  std::cout << "SAVING THE SHASHMAP" << std::endl;
  v8::String::Utf8Value param1(args[0]->ToString());
  std::ofstream* stream = new std::ofstream(std::string(*param1), std::ios::out | std::ios::binary);
  slips.serialize(StringToIntSerializer(), stream);
  stream->close();
  delete stream;

}
void jsLoadHashmap(const FunctionCallbackInfo<Value>& args) {

  std::cout << "LOADING THE SHASHMAP" << std::endl;

  v8::String::Utf8Value param1(args[0]->ToString());

  // Read
  std::ifstream* istream = new std::ifstream(std::string(*param1));
  slips.unserialize(StringToIntSerializer(), istream);
  for (dense_hash_map<string, int>::iterator it = slips.begin(); it != slips.end(); ++it) {
    printf("slips: %s -> %d\n", it->first.c_str(), it->second);
  }
  istream->close();
  delete istream;

}


void jsInsertSlip(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);
  int value = args[1]->NumberValue();

  int rv = insert_new_slip(slipname, value);

  args.GetReturnValue().Set(rv);

}
void jsValidateMempoolSlip(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);
  int rv = validate_mempool_slip(slipname); 
 
  args.GetReturnValue().Set(rv);
}
void jsValidateSlip(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);
  int value = args[1]->NumberValue();

  int rv = validate_existing_slip(slipname, value);
  
  args.GetReturnValue().Set(rv);
}
void jsValidateSlipSpent(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);
  int current_bid = args[1]->NumberValue();

  int rv = validate_slip_spent(slipname, current_bid);

  args.GetReturnValue().Set(rv);
}
void jsExistsSlip(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);

  int rv = check_slip_exists(slipname);

  args.GetReturnValue().Set(rv);

}
void jsDeleteSlip(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);

  int rv = delete_slip(slipname);

  args.GetReturnValue().Set(rv);

}
void jsSlipValue(const FunctionCallbackInfo<Value>& args) {

  //Isolate* isolate = args.GetIsolate();

  ///////////////
  // variables //
  ///////////////
  v8::String::Utf8Value param1(args[0]->ToString());
  std::string slipname = std::string(*param1);

  int rv = slip_value(slipname);

  args.GetReturnValue().Set(rv);

}









// this function is run when we include the module into
// our application. 
void init(Local<Object> exports) {

  // on initialization, we resize our Hashmap to a reasonable number
  //slips.resize(100000000);


  ////////////////////////
  // initialize hashmap //
  ////////////////////////
  std::string y = "_1";
  std::string z = "_2";
  slips.set_empty_key(y);
  slips.set_deleted_key(z);

  NODE_SET_METHOD(exports, "insert_slip",  jsInsertSlip);
  NODE_SET_METHOD(exports, "validate_slip",  jsValidateSlip);
  NODE_SET_METHOD(exports, "validate_mempool_slip",  jsValidateMempoolSlip);
  NODE_SET_METHOD(exports, "validate_slip_spent",  jsValidateSlipSpent);
  NODE_SET_METHOD(exports, "exists_slip",  jsExistsSlip);
  NODE_SET_METHOD(exports, "slip_value",  jsSlipValue);
  NODE_SET_METHOD(exports, "delete_slip",  jsDeleteSlip);
  NODE_SET_METHOD(exports, "save",  jsSaveHashmap);
  NODE_SET_METHOD(exports, "load",  jsLoadHashmap);

}

NODE_MODULE(shashmap, init)




























/////////////////////
// Open Input File //
/////////////////////
std::string open_file(std::string filename) {

        std::string fulltext = "";

        //try {

                std::string str;
                std::ifstream INPUT(filename.c_str());
                int loop = 0;
                while (std::getline(INPUT, str)) {
                        if (loop != 0) {
                                fulltext += "\n";
                        } fulltext += str; loop++;
                }
                INPUT.close();
        //}

        //catch (...) {
	//	return "";
        //}
        return fulltext;
}
/////////////////////
// return slipname //
/////////////////////
std::string return_slipname(std::string bid, std::string tid, std::string sid, std::string address, std::string amount, std::string bhash) {
  return bid + tid + sid + address + bhash + amount;
}
//////////////////////////
// update existing slip //
//////////////////////////
int update_existing_slip(std::string slipname, int value) {
  return insert_new_slip(slipname, value);
}
/////////////////////
// insert new slip //
/////////////////////
int insert_new_slip(std::string slipname, int spent_value_of_zero) {
  slips[slipname] = spent_value_of_zero;
  return 1;
}
////////////////////////////
// validate existing slip //
////////////////////////////
int validate_mempool_slip(std::string slipname) {
  int x = slips[slipname];
  if (x == 0) { return 0; }
  if (x == -1) { return 1; }
  return 0;
}
////////////////////////////
// validate existing slip //
////////////////////////////
int validate_existing_slip(std::string slipname, int current_block_id) {
  int x = slips[slipname];
  if (x == 0) { return 0; }
  if (x == -1) { return 1; }
  if (x >= current_block_id) { return 1; }
  return 0;
}
///////////////////
// is slip spent //
///////////////////
int validate_slip_spent(std::string slipname, int current_block_id) {
  int x = slips[slipname];
  if (x >= 0) { return 1; }
  if (x == -1) { return 0; }
  return 0;
}
/////////////////
// slip value //
/////////////////
int slip_value(std::string slipname) {
  return slips[slipname];
}
/////////////////
// delete slip //
/////////////////
int delete_slip(std::string slipname) {
  slips.erase(slipname);
  return 1;
}
///////////////////////
// check slip exists //
///////////////////////
int check_slip_exists(std::string slipname) {
  if (slips.find(slipname) != slips.end()) {
    return 1;
  }
  return 0;
}





