/*
	Auto ID3Tag

	Copyright (c) 2025 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/
"use strict" ;



const path = require( 'path' ) ;
const fs = require( 'fs' ) ;
const exec = require( 'child_process' ).exec ;

const string = require( 'string-kit' ) ;

const Promise = require( 'seventh' ) ;



function AutoID3Tag( params = {} ) {
	this.dryRun = !! params.dryRun ;
	this.verbose = !! params.verbose ;

	// If true, tags guessed from filesystem (files and directories names) overwrite existing ID3 tags
	this.filesystemPriority = !! params.filesystemPriority ;

	this.inputDirectoryScheme = Array.isArray( params.inputDirectoryScheme ) ? params.inputDirectoryScheme : null ;

	if ( ! this.inputDirectoryScheme && params.directoryLevels ) {
		switch ( params.directoryLevels ) {
			case 1 :
				this.inputDirectoryScheme = [ 'artist' ] ;
				break ;
			case 2 :
				this.inputDirectoryScheme = [ 'artist' , 'album' ] ;
				break ;
			case 3 :
				this.inputDirectoryScheme = [ 'genre' , 'artist' , 'album' ] ;
				break ;
		}
	}

	if ( ! this.inputDirectoryScheme ) { this.inputDirectoryScheme = [] ; }

	this.inputFileNameTitleScheme = Array.isArray( params.inputFileNameTitleScheme ) && params.inputFileNameTitleScheme.length > 0 ?
		params.inputFileNameTitleScheme :
		[ 'title' ] ;

	this.outputFileNameTitleScheme = Array.isArray( params.outputFileNameTitleScheme ) && params.outputFileNameTitleScheme.length > 0 ?
		params.outputFileNameTitleScheme :
		[ 'suite' , 'title' , 'subtitle' ] ;
}

module.exports = AutoID3Tag ;



AutoID3Tag.prototype.autoPatchDirectory = async function( dirPath ) {
	var filePathList = await this.readDirectory( dirPath ) ;

	var dirData = {} ;
	this.extractDataFromDirectories( dirPath , dirData ) ;

	if ( this.verbose ) { console.log( "Directory data:" , dirData ) ; }
	console.log( "Files:" , filePathList.length , "\n" ) ;

	for ( let filePath of filePathList ) {
		let fileData = Object.assign( {} , dirData ) ;
		let fileName = path.basename( filePath ) ;
		let extension = path.extname( fileName ) ;
		let fileBaseName = fileName.slice( 0 , fileName.length - extension.length ) ;
		this.extractDataFromFileName( fileBaseName , fileData ) ;

		let tags = await this.readID3Tags( filePath ) ;

		if ( this.verbose ) {
			console.log( "\nFile:" , filePath ) ;
			console.log( "File name data:" , this.extractDataFromFileName( fileBaseName ) ) ;
			console.log( "File name + directory data:" , fileData ) ;
			console.log( "ID3Tags:" , tags ) ;
		}

		let tagChanged = false ;

		for ( let key of Object.keys( fileData ) ) {
			if ( fileData[ key ] && fileData[ key ] !== tags[ key ] && ( this.filesystemPriority || ! tags[ key ] ) ) {
				tags[ key ] = fileData[ key ] ;
				tagChanged = true ;
			}
		}

		if ( tagChanged ) {
			console.log( "Patched ID3Tags:" , tags ) ;
			await this.writeID3Tags( filePath , tags ) ;
		}

		let wantedFileBaseName = this.getFileBaseNameFromTags( tags ) ;
		if ( wantedFileBaseName && wantedFileBaseName !== fileBaseName ) {
			//console.log( "Wanted file base name:" , wantedFileBaseName , "but got:" , fileBaseName ) ;
			let newFilePath = path.join( dirPath , wantedFileBaseName + extension ) ;
			if ( this.dryRun ) {
				console.log( "Would rename:" , path.basename( filePath ) , "to:" , path.basename( newFilePath ) ) ;
			}
			else {
				console.log( "Rename:" , path.basename( filePath ) , "to:" , path.basename( newFilePath ) ) ;
				await fs.promises.rename( filePath , newFilePath ) ;
			}
		}
	}
} ;



AutoID3Tag.prototype.setDirectoryTag = async function( dirPath , tagName , tagContent ) {
	if ( ! tagName || ! tagContent ) { throw new Error( "Missing tag name or content" ) ; }

	if ( ! ALL_ID3_FRAME_NAMES.has( tagName ) && ! Object.hasOwn( TAG_NAME_CONVERSION , tagName ) ) {
		throw new Error( 'Unknown tag name: ' + tagName ) ;
	}

	var filePathList = await this.readDirectory( dirPath ) ;

	for ( let filePath of filePathList ) {
		let tags = await this.readID3Tags( filePath ) ;

		if ( tags[ tagName ] !== tagContent ) {
			tags[ tagName ] = tagContent ;
			await this.writeID3Tags( filePath , tags ) ;
		}
	}
} ;



AutoID3Tag.prototype.extractDataFromDirectories = function( dirPath , data = {} ) {
	if ( ! this.inputDirectoryScheme || ! this.inputDirectoryScheme.length ) { return data ; }

	let index = this.inputDirectoryScheme.length ;
	while ( index -- ) {
		data[ this.inputDirectoryScheme[ index ] ] = path.basename( dirPath ) ;
		dirPath = path.dirname( dirPath ) ;
	}

	return data ;
} ;



const FILENAME_SCHEME = /^(?:([0-9]+)(?:\.| ?- ?))?(.*)$/ ;

AutoID3Tag.prototype.extractDataFromFileName = function( fileBaseName , data = {} ) {
	let match = fileBaseName.match( FILENAME_SCHEME ) ;
	if ( ! match ) { return data ; }

	if ( match[ 1 ] && + match[ 1 ] ) { data.track = "" + ( + match[ 1 ] ) ; }
	if ( match[ 2 ] ) {
		if ( this.inputFileNameTitleScheme.length === 1 ) {
			data[ this.inputFileNameTitleScheme[ 0 ] ] = match[ 2 ] ;
		}
		else {
			let parts = match[ 2 ].split( ' - ' ) ;
			let shift = 0 ;

			if ( this.inputFileNameTitleScheme.length !== parts.length ) {
				let indexOf = this.inputFileNameTitleScheme.indexOf( 'title' ) ;
				if ( indexOf >= parts.length ) {
					shift = 1 + indexOf - parts.length ;
				}
			}

			for ( let index = 0 ; index < parts.length ; index ++ ) {
				data[ this.inputFileNameTitleScheme[ index + shift ] ] = parts[ index ] ;
			}
		}
	}

	return data ;
} ;



AutoID3Tag.prototype.getFileBaseNameFromTags = function( tags = {} ) {
	let fileBaseName = '' ;

	if ( tags.track ) {
		let trackMatch = tags.track.match( /^[0-9]+/ ) ;
		if ( trackMatch ) {
			let track = trackMatch[ 0 ] ;
			if ( track.length < 2 ) { track = '0' + track ; }
			fileBaseName += ( fileBaseName ? ' - ' : '' ) + track ;
		}
	}

	for ( let key of this.outputFileNameTitleScheme ) {
		if ( tags[ key ] ) {
			fileBaseName += ( fileBaseName ? ' - ' : '' ) + tags[ key ] ;
		}
	}

	fileBaseName = fileBaseName.replace( /[`’]/g , "'" ) ;
	fileBaseName = fileBaseName.replace( /[^\p{L}\p{N} _.',()[\]&-]+/gu , '' ) ;
	fileBaseName = fileBaseName.replace( /  +/g , ' ' ).replace( /(^ +| +$)/ , '' ) ;
	fileBaseName = fileBaseName.replace( /\.\.+/g , '.' ).replace( /(^\.+|\.+$)/ , '' ) ;

	return fileBaseName ;
} ;



const SUPPORTED_EXTENSIONS = new Set( [ 'mp3' ] ) ;

AutoID3Tag.prototype.readDirectory = async function( dirPath ) {
	var filePathList = [] ,
		dirEntList = await fs.promises.readdir( dirPath , { withFileTypes: true } ) ;

	for ( let dirEnt of dirEntList ) {
		if ( dirEnt.isFile() ) {
			let extension = path.extname( dirEnt.name ).slice( 1 ).toLowerCase() ;
			if ( SUPPORTED_EXTENSIONS.has( extension ) ) {
				filePathList.push( path.join( dirPath , dirEnt.name ) ) ;
			}
		}
	}

	return filePathList ;
} ;



const ALL_ID3_FRAME_NAMES = new Set( [
	'TIT1' , 'TIT2' , 'TIT3' , 'TALB' , 'TOAL' , 'TRCK' , 'TPOS' , 'TSST' ,
	'TPE1' , 'TPE2' , 'TPE3' , 'TPE4' , 'TOPE' , 'TEXT' , 'TOLY' , 'TCOM' , 'TMCL' , 'TIPL' ,
	'TDRC' , 'TDEN' , 'TDOR' , 'TDRL' , 'TDTG' , 'TYER' , 'TDAT' , 'TIME' ,
	'TCON' , 'TBPM' , 'TLEN' , 'TMED' , 'TMOO' , 'TCMP' , 'TCOP' , 'TPRO' , 'TPUB' , 'TOWN' ,
	'TRSN' , 'TRSO' , 'TOFN' , 'TDLY' , 'TSRC' , 'TSSE' , 'TENC' , 'TSOP' , 'TSOA' , 'TSOT' , 'TSOC' ,
	'TKEY' , 'TLAN' , 'TFLT' , 'USLT' , 'SYLT' , 'TXXX' ,
	'WCOM' , 'WCOP' , 'WOAF' , 'WOAR' , 'WOAS' , 'WORS' , 'WPAY' , 'WPUB' , 'WXXX' ,
	'APIC' , 'GEOB' , 'POPM' , 'RBUF' , 'AENC' , 'ENCR' , 'SIGN' , 'SEEK' , 'PRIV' , 'COMR' , 'USER' ,
	'RVA2' , 'EQU2' , 'PCNT' ,
	'TYER' , 'TDAT' , 'TIME' , 'TRDA' , 'TSIZ'
] ) ;



// Only common/useful tags
const TAG_NAME_CONVERSION = {
	artist: 'TPE1' ,			// Lead performer(s) / Soloist(s)
	composer: 'TCOM' ,			// Composer(s)
	originalArtist: 'TOPE' ,	// Original artist(s) / Performer(s), in case of covers the cover artist is TPE1 and the original is TOPE
	album: 'TALB' ,				// Album
	suite: 'TIT1' ,				// Group/suite/series/piece/opus/work for grouping titles
	title: 'TIT2' ,				// Main title
	subtitle: 'TIT3' ,			// Subtitle
	track: 'TRCK' ,				// Track number, e.g.: "3" or "3/12"
	disc: 'TPOS' ,				// Part of a set (disc number), e.g.: "1" or "1/2"
	genre: 'TCON' ,				// Music genre (content type)
	bpm: 'TBPM' ,				// Tempo in BPM (Beats Per Minute)
	year: 'TYER' ,				// Year

	// Aliases
	opus: 'TIT1' ,
	group: 'TIT1' ,
	work: 'TIT1' ,
	series: 'TIT1'
} ;

const REVERSE_TAG_NAME_CONVERSION = {} ;

for ( let key of Object.keys( TAG_NAME_CONVERSION ) ) {
	let value = TAG_NAME_CONVERSION[ key ] ;
	if ( ! Object.hasOwn( REVERSE_TAG_NAME_CONVERSION , value ) ) {
		REVERSE_TAG_NAME_CONVERSION[ value ] = key ;
	}
}



AutoID3Tag.prototype.readID3Tags = function( filePath ) {
	var promise = new Promise() ,
		command = "id3v2 -l " + string.escape.shellArg( filePath ) ;

	//console.log( "Running command: " + command ) ;

	exec( command , {} , ( error , stdout , stderr ) => {
		if ( error ) {
			promise.reject( error ) ;
			return ;
		}
		let rawTags = this.parseId3v2CliOutput( stdout ) ;
		promise.resolve( rawTags ) ;
	} ) ;

	return promise ;
} ;



AutoID3Tag.prototype.writeID3Tags = function( filePath , humanTags = {} ) {
	var promise = new Promise() ,
		rawTags = this.convertFromHumanTags( humanTags ) ,
		command = "id3v2 -2" ;

	for ( let key of Object.keys( rawTags ) ) {
		command += ' --' + key + ' ' + string.escape.shellArg( rawTags[ key ] ) ;
	}

	command += ' ' + string.escape.shellArg( filePath ) ;

	if ( this.dryRun ) {
		console.log( "Would run command: " + command ) ;
		promise.resolve() ;
		return promise ;
	}

	console.log( "Running command: " + command ) ;

	exec( command , {} , ( error , stdout , stderr ) => {
		if ( error ) {
			promise.reject( error ) ;
			return ;
		}
		promise.resolve() ;
	} ) ;

	return promise ;
} ;



AutoID3Tag.prototype.parseId3v2CliOutput = function( str ) {
	var rawTags = {} ;

	//console.log( "raw:\n" + str + "\n" ) ;
	let id3v2Match = str.match( /(?<=^|\n)id3v2 .*:\n/ ) ;
	//console.log( "id3v2Match:" , id3v2Match ) ;
	if ( ! id3v2Match ) { return rawTags ; }

	let id3v2parts = str ;

	let id3v1Match = str.match( /(?<=^|\n)id3v1 .*:\n/ ) ;
	if ( ! id3v1Match ) { id3v1Match = str.match( /(?<=^|\n)[^A-Z].*: No ID3v1 tag\n/ ) ; }
	//console.log( "id3v1Match:" , id3v1Match ) ;

	if ( id3v1Match && id3v1Match.index > id3v2Match.index ) {
		id3v2parts = id3v2parts.slice( 0 , id3v1Match.index ) ;
	}

	id3v2parts = id3v2parts.slice( id3v2Match.index + id3v2Match[ 0 ].length ).split( '\n' ) ;
	//console.log( "id3v2 raw parts:" , id3v2parts ) ;

	for ( let part of id3v2parts ) {
		let partMatch = part.match( /^([A-Z0-9]{4}).*: ([^\n]*)$/ ) ;
		if ( partMatch ) {
			let key = partMatch[ 1 ] ;
			if ( ALL_ID3_FRAME_NAMES.has( key ) ) {
				let value = partMatch[ 2 ] ;
				//console.log( "part:" , part , "key:" , key , "value:" , value ) ;
				rawTags[ key ] = value ;
			}
		}
	}

	let humanTags = this.convertToHumanTags( rawTags ) ;
	//console.log( "Human-readable tags:" , humanTags ) ;
	return humanTags ;
} ;



AutoID3Tag.prototype.convertToHumanTags = function( rawTags ) {
	var humanTags = {} ;

	for ( let rawName of Object.keys( rawTags ) ) {
		if ( Object.hasOwn( REVERSE_TAG_NAME_CONVERSION , rawName ) ) {
			humanTags[ REVERSE_TAG_NAME_CONVERSION[ rawName ] ] = rawTags[ rawName ] ;
		}
		else {
			humanTags[ rawName ] = rawTags[ rawName ] ;
		}
	}

	return humanTags ;
} ;



AutoID3Tag.prototype.convertFromHumanTags = function( humanTags ) {
	var rawTags = {} ;

	for ( let humanName of Object.keys( humanTags ) ) {
		if ( Object.hasOwn( TAG_NAME_CONVERSION , humanName ) ) {
			rawTags[ TAG_NAME_CONVERSION[ humanName ] ] = humanTags[ humanName ] ;
		}
		else if ( ALL_ID3_FRAME_NAMES.has( humanName ) ) {
			rawTags[ humanName ] = humanTags[ humanName ] ;
		}
	}

	return rawTags ;
} ;

